/**
 * Достать текст рецепта по ссылке.
 *
 * Приложение — статический сайт: обратиться к чужому домену из браузера оно не
 * может, там и чужой источник, и вход по логину. Поэтому ссылку открывает эта
 * служба, а разбирает добытый текст всё тот же `src/lib/recipeText`, что и при
 * вставке руками. Никакого второго разбора: один текст — один способ его
 * понять.
 *
 * Здесь только чистая часть — проверка ссылки и вытаскивание текста из
 * страницы. Ни сети, ни сервера: это проверяется без того и другого.
 */

/**
 * Куда ходить нельзя.
 *
 * Ссылку присылает кто угодно, а ходит по ней сервер — изнутри сети, где у него
 * есть доступ к соседям и к служебным адресам облака. Без этой проверки чужой
 * человек может через нашу службу постучаться в базу данных или в
 * метаданные машины и получить оттуда ответ. Поэтому в частные сети не ходим
 * вовсе, а решаем это до запроса, а не после.
 */
const PRIVATE_V4 = [
  [10, 0, 0, 0, 8],
  [127, 0, 0, 0, 8],
  [169, 254, 0, 0, 16],
  [172, 16, 0, 0, 12],
  [192, 168, 0, 0, 16],
  [100, 64, 0, 0, 10],
  [0, 0, 0, 0, 8],
]

export function isPrivateAddress(host) {
  const clean = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (clean === 'localhost' || clean.endsWith('.localhost') || clean.endsWith('.internal')) return true
  // IPv6: петля, локальные и уникальные локальные адреса
  if (clean === '::1' || clean === '::' ) return true
  if (/^f[cd][0-9a-f]{2}:/.test(clean) || /^fe80:/.test(clean)) return true
  // адрес IPv4, завёрнутый в IPv6
  const mapped = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  const ipv4 = mapped ? mapped[1] : clean
  const octets = ipv4.split('.')
  if (octets.length !== 4 || octets.some((o) => !/^\d{1,3}$/.test(o))) return false
  const value = octets.reduce((sum, o) => sum * 256 + Number(o), 0)
  if (octets.some((o) => Number(o) > 255)) return false
  return PRIVATE_V4.some(([a, b, c, d, bits]) => {
    const net = ((a * 256 + b) * 256 + c) * 256 + d
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0
    return (value & mask) >>> 0 === (net & mask) >>> 0
  })
}

/**
 * Ссылка, по которой можно пойти. `null` — нельзя, и причина не уточняется:
 * подробный отказ рассказал бы чужому человеку про нашу сеть больше, чем нужно.
 */
export function safeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2000) return null
  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname || isPrivateAddress(url.hostname)) return null
  return url
}

/** Раскодировать то, чем страница обозначает кавычки и переводы строк. */
function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    const key = code.toLowerCase()
    if (named[key] !== undefined) return named[key]
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16))
    if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)))
    return whole
  })
}

/** Значение мета-тега: og:description, description, og:title и им подобных. */
function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const hit = html.match(pattern)
    if (hit) return decodeEntities(hit[1])
  }
  return null
}

/**
 * Подписи под роликами пишут одной строкой с «\n» внутри, а рецепт без строк
 * не разобрать: список продуктов от списка шагов отличается переводом строки.
 */
function unescapeLines(text) {
  return text.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/[\u2028\u2029]/g, '\n')
}

/**
 * Хвост подписи: призывы подписаться, метки и прочее, к рецепту не относящееся.
 * Разбор их и так не узнает, но в списке непонятого они только мешают.
 */
function trimChatter(text) {
  return text
    .split('\n')
    .filter((line) => {
      const bare = line.trim()
      if (!bare) return true
      if (/^#\S+(\s+#\S+)*$/.test(bare)) return false
      return !/подпис[аы]|сохран[яи].*чтобы не потерять|ставь.*лайк|делись|в шапке профил/i.test(bare)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Текст рецепта со страницы.
 *
 * Порядок такой: сначала описание для соцсетей — в нём у роликов лежит вся
 * подпись целиком, — потом обычное описание страницы. `null` значит, что текста
 * не нашлось: страница закрыта входом по логину или это вовсе не рецепт.
 */
export function captionFrom(html) {
  if (typeof html !== 'string' || html.length === 0) return null
  const description =
    metaContent(html, 'og:description') ??
    metaContent(html, 'twitter:description') ??
    metaContent(html, 'description')
  const title = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title')

  const body = description ? trimChatter(unescapeLines(description)) : ''
  if (!body) return null

  // заголовок ставим первой строкой, если его там ещё нет: разбор берёт
  // название блюда именно оттуда
  const heading = title ? unescapeLines(title).trim().slice(0, 70) : ''
  const text = heading && !body.startsWith(heading) ? `${heading}\n${body}` : body
  return { text, title: heading || null }
}
