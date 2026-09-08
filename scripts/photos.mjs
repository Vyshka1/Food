#!/usr/bin/env node
/** Что уже закрыто фотографиями, а что нет. Запуск: npm run photos */
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const source = readFileSync(`${root}src/data/recipes.ts`, 'utf8')

// вытаскиваем id и название из вызовов r('id', 'Название', ...)
const recipes = [...source.matchAll(/\n {2}r\(\s*\n?\s*'([^']+)',\s*\n?\s*'([^']+)'/g)].map(
  ([, id, title]) => ({ id, title }),
)

const names = (dir) =>
  existsSync(dir) ? new Set(readdirSync(dir).map((f) => f.replace(/\.[^.]+$/, ''))) : new Set()

const dish = names(`${root}src/assets/photos/dish`)
const kind = names(`${root}src/assets/photos/kind`)

const KINDS = [
  'soup', 'porridge', 'salad', 'bake', 'pan',
  'fish', 'meat', 'pancake', 'drink', 'apple',
]

console.log(`Рецептов: ${recipes.length}`)
console.log(`Своих фото: ${dish.size} · категорийных: ${kind.size} из ${KINDS.length}\n`)

const missingKinds = KINDS.filter((k) => !kind.has(k))
if (missingKinds.length > 0) console.log(`Нет фото категорий: ${missingKinds.join(', ')}\n`)

const without = recipes.filter((r) => !dish.has(r.id))
if (without.length === 0) {
  console.log('У каждого блюда есть своё фото.')
} else {
  console.log(`Без своего фото — ${without.length}:`)
  for (const r of without) console.log(`  ${r.id.padEnd(28)} ${r.title}`)
}
