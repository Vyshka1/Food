import type { ThawReminder, WeekMenu } from '../types'
import { recipeById } from '../data/recipeRegistry'

/*
 * Напоминания о разморозке живут отдельно от разметки заморозки.
 *
 * Разметка — это свойство рецепта: она выводится из его шагов и состава, и её
 * считают при сборке базы. Напоминание — это уже свойство недели: ему нужно
 * меню и справочник рецептов. Пока они лежали в одном файле, справочник
 * тянулся обратно в сборку базы, и весь круг держался на ленивом построении
 * списка.
 */

/**
 * Когда доставать заготовки из морозилки.
 *
 * Блюдо, которое едят в четверг, должно попасть в холодильник в среду
 * вечером — иначе в четверг его придётся размораживать в спешке или греть
 * из камня. Раньше приложение об этом молчало.
 */
export function thawReminders(menu: WeekMenu): ThawReminder[] {
  const reminders: ThawReminder[] = []
  const seen = new Set<string>()
  for (const entry of menu.entries) {
    if (entry.storage !== 'freezer') continue
    const recipe = recipeById(entry.recipeId)
    const info = recipe?.freezing
    if (!recipe || !info || info.thawHours <= 0) continue
    // за 12 часов — значит накануне вечером; за пару часов — в тот же день
    const day = info.thawHours >= 8 ? entry.day - 1 : entry.day
    if (day < 0) continue
    const key = `${entry.recipeId}:${day}:${entry.day}`
    if (seen.has(key)) continue
    seen.add(key)
    reminders.push({
      recipeId: recipe.id,
      title: recipe.title,
      day,
      forDay: entry.day,
      method: info.thaw,
      hours: info.thawHours,
    })
  }
  return reminders.sort((a, b) => a.day - b.day || a.forDay - b.forDay)
}
