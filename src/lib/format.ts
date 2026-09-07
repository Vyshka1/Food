/** Русские склонения: plural(2, ['блюдо', 'блюда', 'блюд']) → 'блюда'. */
export function plural(n: number, forms: [one: string, few: string, many: string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

/** «1,5» вместо «1.5» — в русском тексте десятичная запятая. */
export function decimal(value: number, digits = 1): string {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits
  return String(rounded).replace('.', ',')
}

/**
 * «540 г · 1,5 порции». Порции важны не меньше веса: одно блюдо делится на
 * разные тарелки, и «полторы порции» человек раскладывает половником, а не
 * взвешивает.
 */
export function portionsLabel(count: number): string {
  const rounded = Math.round(count * 10) / 10
  const forms: [string, string, string] = ['порция', 'порции', 'порций']
  // дробное число в русском требует родительного падежа: «2,5 порции», а не
  // «2,5 порций» — по целой части склонять нельзя
  const word = Number.isInteger(rounded) ? plural(rounded, forms) : forms[1]
  return `${decimal(rounded)} ${word}`
}
