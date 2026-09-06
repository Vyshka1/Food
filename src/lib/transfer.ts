import type { Household, Recipe } from '../types'

/**
 * Перенос профиля между браузерами и устройствами без сервера: анкета и свои
 * рецепты пакуются в строку, которая живёт в хвосте ссылки (после #). Фрагмент
 * ссылки не уходит на сервер, но лежит в истории браузера — поэтому в интерфейсе
 * честно предупреждаем, что в ней личные данные.
 */
export interface ProfilePayload {
  v: 1
  household: Household
  customRecipes: Recipe[]
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeProfile(payload: Omit<ProfilePayload, 'v'>): string {
  return toBase64Url(JSON.stringify({ v: 1, ...payload }))
}

/** Принимает и голый код, и целую ссылку — как её ни скопировали. */
export function decodeProfile(input: string): ProfilePayload | null {
  const raw = input.trim()
  if (!raw) return null
  const code = raw.includes('#data=') ? raw.slice(raw.indexOf('#data=') + 6) : raw
  try {
    const parsed = JSON.parse(fromBase64Url(code.trim())) as Partial<ProfilePayload>
    if (parsed.v !== 1) return null
    if (!parsed.household || !Array.isArray(parsed.household.eaters)) return null
    if (parsed.household.eaters.length === 0) return null
    return {
      v: 1,
      household: parsed.household,
      customRecipes: Array.isArray(parsed.customRecipes) ? parsed.customRecipes : [],
    }
  } catch {
    return null
  }
}

export function profileLink(payload: Omit<ProfilePayload, 'v'>, origin: string): string {
  const base = origin.split('#')[0]
  return `${base}#data=${encodeProfile(payload)}`
}
