import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { MACRO_COLOR, RING_TRACK } from '../lib/palette'

export function Card({
  children,
  variant,
  onClick,
}: {
  children: ReactNode
  variant?: 'soft' | 'green'
  onClick?: () => void
}) {
  const cls = ['card', variant ? `card--${variant}` : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} onClick={onClick}>
      {children}
    </div>
  )
}

export function Section({
  title,
  icon,
  children,
  variant,
}: {
  title: string
  icon?: IconName
  children: ReactNode
  variant?: 'soft' | 'green'
}) {
  return (
    <Card variant={variant}>
      <div className="section-title">
        {icon && <Icon name={icon} size={16} />}
        {title}
      </div>
      {children}
    </Card>
  )
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`chip${active ? ' chip--active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

export function Field({
  label,
  value,
  onChange,
  type = 'number',
  suffix,
}: {
  label: string
  value: number | string
  onChange: (value: string) => void
  type?: 'number' | 'text'
  suffix?: string
}) {
  return (
    <div className="field">
      <label>
        {label}
        {suffix ? `, ${suffix}` : ''}
      </label>
      <input
        type={type}
        value={value}
        inputMode={type === 'number' ? 'numeric' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-active={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="минус">
        −
      </button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="плюс">
        +
      </button>
    </div>
  )
}

export function Switch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="switch"
      data-on={on}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    />
  )
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  // Шторка занимает почти весь экран, поэтому «нажать мимо» — не способ её закрыть:
  // нужен явный крестик, Esc и свайп вниз.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const swipeStart = useRef<number | null>(null)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          swipeStart.current = e.currentTarget.scrollTop === 0 ? e.touches[0].clientY : null
        }}
        onTouchEnd={(e) => {
          const start = swipeStart.current
          swipeStart.current = null
          if (start !== null && e.changedTouches[0].clientY - start > 90) onClose()
        }}
      >
        <div className="sheet__head">
          <button
            type="button"
            className="sheet__grip"
            onClick={onClose}
            aria-label="Закрыть"
          />
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Кольцо суточной нормы: заполненная часть — белки/жиры/углеводы по калориям. */
export function CalorieRing({
  kcal,
  protein,
  fat,
  carbs,
  label = 'ккал в день',
}: {
  kcal: number
  protein: number
  fat: number
  carbs: number
  label?: string
}) {
  const total = protein * 4 + fat * 9 + carbs * 4 || 1
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const parts = [
    { value: (protein * 4) / total, color: MACRO_COLOR.protein },
    { value: (fat * 9) / total, color: MACRO_COLOR.fat },
    { value: (carbs * 4) / total, color: MACRO_COLOR.carbs },
  ]
  let offset = 0
  return (
    <div className="ring">
      <svg width="116" height="116" viewBox="0 0 116 116">
        <circle cx="58" cy="58" r={radius} fill="none" stroke={RING_TRACK} strokeWidth="12" />
        {parts.map((p, i) => {
          const dash = p.value * circumference
          const el = (
            <circle
              key={i}
              cx="58"
              cy="58"
              r={radius}
              fill="none"
              stroke={p.color}
              strokeWidth="12"
              strokeLinecap="butt"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return el
        })}
      </svg>
      <div className="ring__center">
        <div className="ring__value">{kcal}</div>
        <div className="ring__label">{label}</div>
      </div>
    </div>
  )
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <>
      {items.map((w, i) => (
        <div className="warning" key={i}>
          <Icon name="alert" size={16} className="warning__icon" />
          <span>{w}</span>
        </div>
      ))}
    </>
  )
}
