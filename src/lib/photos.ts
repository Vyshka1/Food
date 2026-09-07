import type { Recipe } from '../types'
import { recipeIcon } from '../components/icons'

/**
 * Фотографии блюд.
 *
 * Каскад из трёх уровней, потому что честного фото на каждое из 78 блюд
 * взять неоткуда:
 *
 * 1. фото самого блюда — `assets/photos/dish/<id>.jpg`, если оно есть;
 * 2. фото категории — `assets/photos/kind/<soup|bake|…>.jpg`, общее для группы;
 * 3. иконка, как сейчас.
 *
 * Категорийное фото честно подписывается как «похожее блюдо»: показывать
 * снимок чужого супа под видом вашего борща — это враньё, которое человек
 * заметит на кухне, когда его блюдо будет выглядеть иначе.
 *
 * Файлов в репозитории пока нет: положите свои в `src/assets/photos/`, и они
 * подхватятся без изменений в коде. Лежат они именно там, а не в `public/`,
 * чтобы сборка знала, какие фото есть: иначе отсутствующий файл превращался
 * бы в битую картинку и лишний запрос.
 */

/** Категория для общего фото — та же, по которой уже выбирается иконка. */
export type PhotoKind = ReturnType<typeof recipeIcon>

export interface DishPhoto {
  src: string
  /** true — фото этого самого блюда; false — похожего из той же категории. */
  exact: boolean
  alt: string
}

/**
 * Какие файлы реально лежат в сборке. Vite подставляет список на этапе
 * сборки, поэтому отсутствующее фото не превращается в битую картинку и
 * лишний запрос — мы просто про него не знаем.
 */
const DISH_FILES = import.meta.glob('../assets/photos/dish/*.{jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const KIND_FILES = import.meta.glob('../assets/photos/kind/*.{jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function lookup(files: Record<string, string>, folder: string, name: string): string | null {
  for (const [path, url] of Object.entries(files)) {
    const base = path.split('/').pop()?.replace(/\.[^.]+$/, '')
    if (base === name && path.includes(`/${folder}/`)) return url
  }
  return null
}

/**
 * Сам каскад, отдельно от файлов на диске: своё фото → фото категории →
 * ничего. Вынесен из `dishPhoto`, чтобы его можно было проверить на любом
 * наборе картинок, а не только на том, что сейчас лежит в репозитории.
 */
export function pickPhoto(
  recipe: Recipe,
  dishFiles: Record<string, string>,
  kindFiles: Record<string, string>,
): DishPhoto | null {
  const own = lookup(dishFiles, 'dish', recipe.id)
  if (own) return { src: own, exact: true, alt: recipe.title }

  const shared = lookup(kindFiles, 'kind', recipeIcon(recipe))
  if (shared) return { src: shared, exact: false, alt: `Похожее блюдо: ${recipe.title}` }

  return null
}

/** Фото блюда, если оно есть: сначала своё, потом категорийное. */
export function dishPhoto(recipe: Recipe): DishPhoto | null {
  return pickPhoto(recipe, DISH_FILES, KIND_FILES)
}

/** Сколько блюд закрыто фотографиями — для честной подписи в профиле. */
export function photoCoverage(recipes: Recipe[]): { own: number; kind: number; none: number } {
  let own = 0
  let kind = 0
  let none = 0
  for (const recipe of recipes) {
    const photo = dishPhoto(recipe)
    if (!photo) none += 1
    else if (photo.exact) own += 1
    else kind += 1
  }
  return { own, kind, none }
}
