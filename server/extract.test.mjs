import { describe, expect, it } from 'vitest'
import { captionFrom, isPrivateAddress, safeUrl } from './extract.mjs'

/*
 * Служба ходит по ссылке, которую прислал кто угодно, и ходит изнутри сети, где
 * у неё есть доступ к соседям и к служебным адресам. Поэтому первая половина
 * этих проверок — про то, куда ходить нельзя.
 */
describe('куда служба не пойдёт', () => {
  it.each([
    ['localhost', true],
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['192.168.0.1', true],
    ['172.16.5.4', true],
    ['100.64.0.1', true],
    // адрес метаданных облака: через него уводят ключи от всей машины
    ['169.254.169.254', true],
    ['::1', true],
    ['fd00::1', true],
    ['::ffff:127.0.0.1', true],
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['instagram.com', false],
    ['172.32.0.1', false],
  ])('%s', (host, want) => {
    expect(isPrivateAddress(host)).toBe(want)
  })

  it('и ссылку в такую сеть не принимает вовсе', () => {
    expect(safeUrl('http://169.254.169.254/latest/meta-data/')).toBeNull()
    expect(safeUrl('http://localhost:5432/')).toBeNull()
    expect(safeUrl('https://instagram.com/reel/abc')?.hostname).toBe('instagram.com')
  })

  it('и не ходит никуда, кроме http и https', () => {
    // file: прочитал бы файлы самого сервера
    expect(safeUrl('file:///etc/passwd')).toBeNull()
    expect(safeUrl('gopher://example.com/')).toBeNull()
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('не ссылка')).toBeNull()
    expect(safeUrl('')).toBeNull()
    expect(safeUrl(null)).toBeNull()
  })
})

describe('текст со страницы', () => {
  const page = (meta) => `<html><head>${meta}</head><body>не отсюда</body></html>`

  it('берёт подпись из описания для соцсетей', () => {
    const html = page(
      '<meta property="og:title" content="Сырники"><meta property="og:description" content="400 г творога\\n2 яйца">',
    )
    expect(captionFrom(html)?.text).toBe('Сырники\n400 г творога\n2 яйца')
  })

  it('переводы строк восстанавливает: без них рецепт не разобрать', () => {
    // подпись под роликом приходит одной строкой, а список продуктов от списка
    // шагов отличается только переводом строки
    const html = page('<meta name="description" content="Суп\\n- тыква 800 г\\n- соль">')
    expect(captionFrom(html)?.text.split('\n')).toHaveLength(3)
  })

  it('раскодирует то, чем страница обозначает кавычки', () => {
    const html = page('<meta property="og:description" content="Салат &quot;Цезарь&quot; &amp; соус">')
    expect(captionFrom(html)?.text).toBe('Салат "Цезарь" & соус')
  })

  it('не повторяет заголовок, если он и так первой строкой', () => {
    const html = page(
      '<meta property="og:title" content="Сырники"><meta property="og:description" content="Сырники\\n400 г творога">',
    )
    expect(captionFrom(html)?.text).toBe('Сырники\n400 г творога')
  })

  it('отбрасывает хвост подписи, к рецепту не относящийся', () => {
    const html = page(
      '<meta property="og:description" content="Суп\\n800 г тыквы\\nСохраняй, чтобы не потерять!\\n#рецепты #пп">',
    )
    const text = captionFrom(html)?.text ?? ''
    expect(text).toContain('800 г тыквы')
    expect(text).not.toContain('Сохраняй')
    expect(text).not.toContain('#рецепты')
  })

  it('порядок свойств у мета-тега может быть любым', () => {
    const html = page('<meta content="200 г творога" property="og:description">')
    expect(captionFrom(html)?.text).toBe('200 г творога')
  })

  it('пустая страница и вход по логину — это «не нашлось», а не выдумка', () => {
    expect(captionFrom(page(''))).toBeNull()
    expect(captionFrom(page('<meta property="og:description" content="">'))).toBeNull()
    expect(captionFrom('')).toBeNull()
    expect(captionFrom(null)).toBeNull()
  })
})
