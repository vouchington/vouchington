import {
  getCurrency,
  parseMajorUnitsToMoney,
  type CurrencyCode,
  type Money,
} from '@ts-shared/money'

const CANONICAL_WHOLE_UNITS = /^(?:0|[1-9][0-9]*)$/
const DECIMAL_DIGITS = /^[0-9]*$/
const DOT_GROUPED_NUMBER = /^[1-9][0-9]{0,2}(?:\.[0-9]{3})+$/
const localeSeparators = new Map<string, { decimal: string; group: string | undefined }>()

export type ParsedMajorUnitMoneyDraft =
  | { accepted: false }
  | { accepted: true; money: Money | null }

export function normalizeLocalizedMajorUnitDraft(draft: string, locale: string): string {
  let separators = localeSeparators.get(locale)
  if (!separators) {
    const formatter = new Intl.NumberFormat(locale)
    separators = {
      decimal: formatter.formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.',
      group: formatter.formatToParts(10_000).find(part => part.type === 'group')?.value,
    }
    localeSeparators.set(locale, separators)
  }
  if (
    separators.decimal === ',' &&
    separators.group === '.' &&
    !draft.includes(',') &&
    DOT_GROUPED_NUMBER.test(draft)
  ) {
    throw new TypeError('Money must not contain an ambiguous grouping separator')
  }
  return separators.decimal !== '.' ? draft.replaceAll(separators.decimal, '.') : draft
}

export function parseMajorUnitMoneyDraft(
  draft: string,
  currency: CurrencyCode,
  locale: string,
): ParsedMajorUnitMoneyDraft {
  let canonicalDraft: string
  try {
    canonicalDraft = normalizeLocalizedMajorUnitDraft(draft, locale)
  } catch {
    return { accepted: false }
  }
  if (canonicalDraft === '') return { accepted: true, money: null }
  const [whole, fraction, extra] = canonicalDraft.split('.')
  if (extra !== undefined || !CANONICAL_WHOLE_UNITS.test(whole ?? '')) return { accepted: false }
  const exponent = getCurrency(currency).minor_unit_exponent
  if (
    fraction !== undefined &&
    (exponent === 0 || fraction.length > exponent || !DECIMAL_DIGITS.test(fraction))
  ) {
    return { accepted: false }
  }
  try {
    return {
      accepted: true,
      money: parseMajorUnitsToMoney(
        canonicalDraft.endsWith('.') ? canonicalDraft.slice(0, -1) : canonicalDraft,
        currency,
      ),
    }
  } catch {
    return { accepted: false }
  }
}
