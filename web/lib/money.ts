import {
  MONEY_SCALE,
  getCurrency,
  parseMajorUnitsToMoney,
  type Money,
  type ScaledMoney,
  type ScaledMoneyAggregate,
} from '@ts-shared/money'
import { formatNumber } from '@ts-shared/utils/format'
import { normalizeLocalizedMajorUnitDraft } from './money-input-draft'

type MoneyLocale = string | string[]

const currencyFormatters = new Map<string, Intl.NumberFormat>()
const DECIMAL_RADIX = 10
const MONTHS_PER_YEAR_NUMBER = 12
const HALF_YEAR_MONTHS_NUMBER = 6
const BIGINT_TEN = BigInt(DECIMAL_RADIX)
const MONTHS_PER_YEAR = BigInt(MONTHS_PER_YEAR_NUMBER)
const HALF_YEAR_MONTHS = BigInt(HALF_YEAR_MONTHS_NUMBER)

export function formatMoney(money: Money, locale: MoneyLocale): string {
  return formatAtScale(money, getCurrency(money.currency).minor_unit_exponent, locale)
}

export function formatScaledMoney(money: ScaledMoney, locale: MoneyLocale): string {
  return formatAtScale(money, MONEY_SCALE, locale)
}

export function formatScaledMoneyList(values: ScaledMoney[], locale: MoneyLocale): string {
  if (values.length === 0) return formatNumber(0, locale)
  return values.map(value => formatScaledMoney(value, locale)).join(', ')
}

export function formatScaledMoneyAggregate(
  money: ScaledMoneyAggregate,
  locale: MoneyLocale,
): string {
  return formatAtScale(money, MONEY_SCALE, locale)
}

export function formatScaledMoneyAggregateList(
  values: ScaledMoneyAggregate[],
  locale: MoneyLocale,
): string {
  if (values.length === 0) return formatNumber(0, locale)
  return values.map(value => formatScaledMoneyAggregate(value, locale)).join(', ')
}

export function majorUnitsInputValue(money: Money | ScaledMoney): string {
  const scale = 'scale' in money ? money.scale : getCurrency(money.currency).minor_unit_exponent
  return decimalString(money.amount, scale, true)
}

export function compatibleMoneyInputValue(
  value: string,
  currency: Money['currency'],
  locale: string,
): string {
  if (value === '') return value
  try {
    parseMajorUnitsToMoney(normalizeLocalizedMajorUnitDraft(value, locale), currency)
    return value
  } catch {
    return ''
  }
}

export function monthlyEquivalent(price: Money, locale: MoneyLocale): string {
  const exponent = getCurrency(price.currency).minor_unit_exponent
  const scaleFactor = BIGINT_TEN ** BigInt(MONEY_SCALE - exponent)
  const scaledAnnualAmount = BigInt(price.amount) * scaleFactor
  const monthlyAmount = (scaledAnnualAmount + HALF_YEAR_MONTHS) / MONTHS_PER_YEAR
  return formatScaledMoneyAggregate(
    { amount: monthlyAmount.toString(), currency: price.currency, scale: MONEY_SCALE },
    locale,
  )
}

function formatAtScale(
  money: Money | ScaledMoneyAggregate,
  scale: number,
  locale: MoneyLocale,
): string {
  const formatterKey = `${JSON.stringify(locale)}:${money.currency}:${scale}`
  let formatter = currencyFormatters.get(formatterKey)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currency.toUpperCase(),
      maximumFractionDigits: scale,
    })
    currencyFormatters.set(formatterKey, formatter)
  }
  return (formatter.format as unknown as (value: string) => string)(
    decimalString(money.amount, scale, true),
  )
}

function decimalString(amount: number | string, scale: number, trimFraction: boolean): string {
  const digits = String(amount).padStart(scale + 1, '0')
  if (scale === 0) return digits

  const split = digits.length - scale
  const whole = digits.slice(0, split)
  const rawFraction = digits.slice(split)
  const fraction = trimFraction ? rawFraction.replace(/0+$/, '') : rawFraction
  return fraction ? `${whole}.${fraction}` : whole
}
