import type { Recipe } from '../types'
import { dishPhoto } from '../lib/photos'
import { KIND_TINT, KIND_TINT_FALLBACK } from '../lib/palette'
import { Icon, recipeIcon } from './icons'

/**
 * Картинка блюда для доски и списков.
 *
 * Фотография, если она есть; иначе плашка с иконкой, окрашенная по виду блюда.
 * Заглушка нарочно не изображает снимок — ни размытия, ни серого прямоугольника
 * «здесь будет фото»: человек либо видит еду, либо видит, что её тут не
 * показывают, и не гадает, что за мутное пятно.
 */
export function DishTile({ recipe, size = 56 }: { recipe: Recipe; size?: number }) {
  const photo = dishPhoto(recipe)
  const kind = recipeIcon(recipe)
  if (photo) {
    return (
      <span className="dish-tile" style={{ width: size, height: size }}>
        <img src={photo.src} alt={photo.alt} />
      </span>
    )
  }
  return (
    <span
      className="dish-tile"
      style={{ width: size, height: size, background: KIND_TINT[kind] ?? KIND_TINT_FALLBACK }}
      aria-hidden="true"
    >
      <Icon name={kind} size={Math.round(size * 0.45)} />
    </span>
  )
}
