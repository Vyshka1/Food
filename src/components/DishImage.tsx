import type { Recipe } from '../types'
import { dishPhoto } from '../lib/photos'
import { Icon, recipeIcon } from './icons'

/**
 * Картинка блюда: фото, если оно есть, иначе иконка. Ничего не ломается и не
 * прыгает, когда фото нет, — а сейчас его нет ни у одного блюда.
 */
export function DishThumb({ recipe, size = 46 }: { recipe: Recipe; size?: number }) {
  const photo = dishPhoto(recipe)
  if (!photo) {
    return (
      <span className="dish__emoji" style={{ width: size, height: size }}>
        <Icon name={recipeIcon(recipe)} size={Math.round(size * 0.52)} />
      </span>
    )
  }
  return (
    <span className="dish__photo" style={{ width: size, height: size }}>
      <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
    </span>
  )
}

/**
 * Широкое фото в карточке рецепта. Если снимок общий для категории, это
 * написано прямо на нём: выдавать чужой суп за ваш борщ нельзя — подмену
 * человек заметит на кухне.
 */
export function DishBanner({ recipe }: { recipe: Recipe }) {
  const photo = dishPhoto(recipe)
  if (!photo) return null
  return (
    <div className="dish-banner">
      <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
      {!photo.exact && <span className="dish-banner__note">похожее блюдо</span>}
    </div>
  )
}
