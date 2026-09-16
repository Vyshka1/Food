// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Household } from '../types'
import { Onboarding } from './Onboarding'

/*
 * Анкета — единственное место, где появляются рост, вес и режим питания, и по
 * ним считается всё остальное. Проверяем не вёрстку, а её работу привратника:
 * незаполненное поле не должно проходить дальше молча, а погасшая «Далее» —
 * молчать о том, что ей мешает.
 */

afterEach(cleanup)

function mount(onDone: (h: Household) => void = () => {}) {
  return render(<Onboarding onDone={onDone} />)
}

/** Поля шага «Состав семьи» идут в одном порядке: возраст, рост, вес. */
function bodyFields(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[type="number"]')]
}

function nextButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Далее/ }) as HTMLButtonElement
}

/** Дойти до шага «Режим питания» — четвёртого по счёту. */
function toSchedule() {
  for (let i = 0; i < 3; i++) act(() => fireEvent.click(nextButton()))
}

function clear(field: HTMLInputElement) {
  act(() => fireEvent.change(field, { target: { value: '' } }))
}

describe('анкета: незаполненные поля', () => {
  it('пустые рост и вес не пускают дальше, и сказано, чего не хватает', () => {
    mount()
    const [, height, weight] = bodyFields()
    clear(height)
    clear(weight)

    expect(nextButton().disabled).toBe(true)
    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: укажите рост и вес.',
    )
  })

  it('норма по пустым полям не показывается вовсе', () => {
    mount()
    const [, height, weight] = bodyFields()
    // 10·0 + 6,25·0 − 5·30 − 161 — формула Миффлина от пустых полей уходит в
    // минус, и экран обещал «−428 ккал в день», а меню собиралось под это
    clear(height)
    clear(weight)

    const norm = [...document.querySelectorAll('.hint')].find((el) =>
      el.textContent?.startsWith('Норма:'),
    )!
    expect(norm.textContent).toBe('Норма: — в день')
    expect(norm.textContent).not.toMatch(/-|−/)
  })

  it('очищенное поле остаётся пустым, а не превращается в ноль', () => {
    mount()
    const [, height] = bodyFields()
    clear(height)
    expect(height.value).toBe('')
  })

  it('заполненная анкета проходит дальше', () => {
    mount()
    expect(nextButton().disabled).toBe(false)
    act(() => fireEvent.click(nextButton()))
    expect(screen.getByText('Шаг 2 из 6')).toBeTruthy()
  })

  it('вернули рост и вес — запрет снимается', () => {
    mount()
    const [, height, weight] = bodyFields()
    clear(height)
    clear(weight)
    act(() => fireEvent.change(height, { target: { value: '168' } }))
    act(() => fireEvent.change(weight, { target: { value: '62' } }))

    expect(nextButton().disabled).toBe(false)
    expect(screen.queryByText(/Чтобы продолжить/)).toBeNull()
  })

  it('когда едоков несколько, сказано, у кого именно пусто', () => {
    mount()
    act(() => fireEvent.click(screen.getByText('+ Добавить')))
    const [, height] = bodyFields()
    clear(height)

    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: укажите рост — Едок 2.',
    )
  })

  it('пустое поле у неактивного едока тоже держит шаг', () => {
    mount()
    // чистим у второго и уходим на вкладку первого: запрет — свойство всей
    // анкеты, а не открытой вкладки, иначе пустые поля уезжают в меню вместе
    // с тем, на кого сейчас не смотрят
    act(() => fireEvent.click(screen.getByText('+ Добавить')))
    clear(bodyFields()[2])
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Я' })))
    clear(bodyFields()[1])

    expect(nextButton().disabled).toBe(true)
    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: укажите рост — Я; укажите вес — Едок 2.',
    )
  })

  it('пустой возраст держит так же, как рост и вес', () => {
    mount()
    // по возрасту считается и норма, и детская таблица вместо формулы:
    // нулевой возраст — такое же незаполненное поле
    clear(bodyFields()[0])

    expect(nextButton().disabled).toBe(true)
    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: укажите возраст.',
    )
  })

  it('пусто во всех трёх полях — перечислены все три', () => {
    mount()
    bodyFields().forEach(clear)
    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: укажите возраст, рост и вес.',
    )
  })

  it('анкета с пустым весом не доходит до «Собрать меню»', () => {
    const onDone = vi.fn()
    mount(onDone)
    clear(bodyFields()[2])
    // шесть нажатий подряд — столько шагов в анкете
    for (let i = 0; i < 6; i++) act(() => fireEvent.click(nextButton()))

    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText('Шаг 1 из 6')).toBeTruthy()
  })
})

describe('анкета: режим питания', () => {
  it('без дней готовки «Далее» гаснет и говорит почему', () => {
    mount()
    toSchedule()
    const days = [...document.querySelectorAll<HTMLButtonElement>('.day-toggle button')]
    const active = days.filter((d) => d.dataset.active === 'true')
    expect(active.length).toBeGreaterThan(0)
    active.forEach((d) => act(() => fireEvent.click(d)))

    expect(nextButton().disabled).toBe(true)
    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: отметьте хотя бы один день готовки.',
    )
  })

  it('без приёмов пищи — то же самое, теми же словами', () => {
    mount()
    toSchedule()
    const meals = [...document.querySelectorAll<HTMLButtonElement>('.chips .chip--active')]
    expect(meals.length).toBeGreaterThan(0)
    meals.forEach((m) => act(() => fireEvent.click(m)))

    expect(nextButton().disabled).toBe(true)
    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: отметьте хотя бы один приём пищи.',
    )
  })

  it('пусто и там и там — сказано про оба, а не про первое попавшееся', () => {
    mount()
    toSchedule()
    document
      .querySelectorAll<HTMLButtonElement>('.chips .chip--active')
      .forEach((m) => act(() => fireEvent.click(m)))
    document
      .querySelectorAll<HTMLButtonElement>('.day-toggle button[data-active="true"]')
      .forEach((d) => act(() => fireEvent.click(d)))

    expect(screen.getByText(/Чтобы продолжить/).textContent).toBe(
      'Чтобы продолжить: отметьте хотя бы один приём пищи; отметьте хотя бы один день готовки.',
    )
  })

  it('на шаге, где мешать нечему, лишних слов нет', () => {
    mount()
    toSchedule()
    expect(nextButton().disabled).toBe(false)
    expect(screen.queryByText(/Чтобы продолжить/)).toBeNull()
  })
})
