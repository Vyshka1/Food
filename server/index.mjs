import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { captionFrom, safeUrl } from './extract.mjs'

const run = promisify(execFile)

/**
 * Служба, которая открывает ссылку и отдаёт текст рецепта.
 *
 * Всё, что она делает, — достаёт текст. Разбирает его приложение, тем же
 * модулем, что и при вставке руками: одинаковый текст должен давать одинаковый
 * рецепт, откуда бы он ни пришёл.
 *
 * Настройки — переменными окружения:
 *   PORT     на каком порту слушать (по умолчанию 8080)
 *   ORIGIN   какому сайту разрешено обращаться, через запятую
 *   YTDLP    путь к yt-dlp, если он установлен
 */
const PORT = Number(process.env.PORT ?? 8080)
const ORIGINS = (process.env.ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const YTDLP = process.env.YTDLP ?? 'yt-dlp'

/** Сколько ждать чужой сервер и сколько от него принимать. */
const FETCH_TIMEOUT = 15_000
const MAX_BYTES = 3_000_000
const MAX_BODY = 4_000

/**
 * Простое ограничение частоты: одна и та же машина не должна гонять службу по
 * чужим сайтам без остановки. Память чистится тем же проходом, что и проверка.
 */
const RATE_WINDOW = 60_000
const RATE_LIMIT = 20
const seen = new Map()

function allowed(ip) {
  const now = Date.now()
  const hits = (seen.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW)
  hits.push(now)
  seen.set(ip, hits)
  if (seen.size > 5000) {
    for (const [key, times] of seen) {
      if (times.every((t) => now - t >= RATE_WINDOW)) seen.delete(key)
    }
  }
  return hits.length <= RATE_LIMIT
}

function cors(req, res) {
  const origin = req.headers.origin
  // разрешаем только названные сайты: список пуст — значит никому
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function send(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(text)
}

/** Прочитать тело запроса, не дав себя завалить размером. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('слишком длинный запрос'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * Забрать страницу.
 *
 * Перенаправления разбираем сами, а не доверяем их `fetch`: сайт может увести
 * запрос на внутренний адрес, и тогда проверка ссылки, сделанная в начале,
 * ничего не значит. Каждый шаг проверяется заново.
 */
async function fetchPage(url) {
  let current = url
  for (let hop = 0; hop < 4; hop += 1) {
    const stop = AbortSignal.timeout(FETCH_TIMEOUT)
    const response = await fetch(current, {
      redirect: 'manual',
      signal: stop,
      headers: {
        // без узнаваемого браузера половина сайтов отдаёт заглушку
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'ru,en;q=0.8',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location')
      if (!next) return null
      const target = safeUrl(new URL(next, current).toString())
      if (!target) return null
      current = target
      continue
    }
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('html') && !type.includes('json') && !type.includes('text')) return null

    // читаем с ограничением: страница может оказаться бесконечной
    const reader = response.body?.getReader()
    if (!reader) return null
    const parts = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) {
        await reader.cancel()
        break
      }
      parts.push(value)
    }
    return Buffer.concat(parts.map((p) => Buffer.from(p))).toString('utf8')
  }
  return null
}

/**
 * Ролики через yt-dlp, если он установлен.
 *
 * Соцсети отдают серверу страницу со входом, а не подпись, — обычным запросом
 * рецепт оттуда не достать. yt-dlp это умеет; когда его нет, служба честно
 * говорит, что не смогла, и человек вставляет текст руками.
 */
async function viaYtdlp(url) {
  try {
    const { stdout } = await run(
      YTDLP,
      ['--no-warnings', '--skip-download', '--dump-single-json', url.toString()],
      { timeout: 45_000, maxBuffer: 8_000_000 },
    )
    const data = JSON.parse(stdout)
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    if (!description) return null
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 70) : ''
    return {
      text: title && !description.startsWith(title) ? `${title}\n${description}` : description,
      title: title || null,
      source: 'yt-dlp',
    }
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, { ok: true })
    return
  }
  if (req.method !== 'POST' || req.url !== '/extract') {
    send(res, 404, { error: 'нет такого адреса' })
    return
  }

  const ip = req.socket.remoteAddress ?? 'неизвестно'
  if (!allowed(ip)) {
    send(res, 429, { error: 'слишком часто — подождите минуту' })
    return
  }

  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch {
    send(res, 400, { error: 'запрос не разобрать' })
    return
  }

  const url = safeUrl(payload?.url)
  if (!url) {
    send(res, 400, { error: 'ссылка не подходит' })
    return
  }

  try {
    // сначала подпись со страницы: это быстро и работает для блогов
    const html = await fetchPage(url)
    const caption = html ? captionFrom(html) : null
    if (caption) {
      send(res, 200, { ...caption, source: 'страница' })
      return
    }
    // не вышло — пробуем yt-dlp: соцсети отдают серверу вход, а не подпись
    const video = await viaYtdlp(url)
    if (video) {
      send(res, 200, video)
      return
    }
    send(res, 422, { error: 'по этой ссылке не нашлось текста рецепта' })
  } catch {
    send(res, 502, { error: 'не удалось открыть ссылку' })
  }
})

server.listen(PORT, () => {
  console.log(`служба разбора рецептов слушает порт ${PORT}`)
  console.log(ORIGINS.length ? `разрешённые сайты: ${ORIGINS.join(', ')}` : 'ORIGIN не задан — браузер не пустит запросы')
})
