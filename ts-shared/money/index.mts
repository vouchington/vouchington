import { createMoneyCatalog, parsePostgresMoneyAmount } from '@vouchington/utils/money'

export { parsePostgresMoneyAmount }
export const MAX_MONEY_AMOUNT = Number.MAX_SAFE_INTEGER
export const MONEY_SCALE = 6 as const
export const MAX_POINT_VALUE_MICROUNITS = 9_999_999_999

export const CURRENCIES = [
  { code: 'usd', minor_unit_exponent: 2 },
  { code: 'cad', minor_unit_exponent: 2 },
  { code: 'eur', minor_unit_exponent: 2 },
  { code: 'gbp', minor_unit_exponent: 2 },
  { code: 'aud', minor_unit_exponent: 2 },
  { code: 'jpy', minor_unit_exponent: 0 },
] as const

export type Currency = (typeof CURRENCIES)[number]
export type CurrencyCode = Currency['code']

export type Money = {
  amount: number
  currency: CurrencyCode
}

export type ScaledMoney = Money & {
  scale: typeof MONEY_SCALE
}

export type ScaledMoneyAggregate = {
  amount: string
  currency: CurrencyCode
  scale: typeof MONEY_SCALE
}

export type MoneyRange = {
  minimum: Money
  maximum: Money | null
}

const moneyCatalog = createMoneyCatalog(
  CURRENCIES.map(({ code, minor_unit_exponent }) => ({
    code,
    minorUnitExponent: minor_unit_exponent,
  })),
  MONEY_SCALE,
)
const CURRENCY_BY_CODE = new Map<CurrencyCode, Currency>(
  CURRENCIES.map(currency => [currency.code, currency]),
)

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return moneyCatalog.isCurrencyCode(value)
}

export function getCurrency(code: CurrencyCode): Currency {
  const currency = moneyCatalog.getCurrency(code)
  return CURRENCY_BY_CODE.get(currency.code)!
}

export function isMoney(value: unknown): value is Money {
  return moneyCatalog.isMoney(value)
}

export function isScaledMoney(value: unknown): value is ScaledMoney {
  return moneyCatalog.isScaledMoney(value)
}

export function isScaledMoneyAggregate(value: unknown): value is ScaledMoneyAggregate {
  return moneyCatalog.isScaledMoneyAggregate(value)
}

export function isMoneyRange(value: unknown): value is MoneyRange {
  return moneyCatalog.isMoneyRange(value)
}

export function parseMajorUnitsToMoney(value: string, currency: CurrencyCode): Money {
  return moneyCatalog.parseMajorUnitsToMoney(value, currency)
}

export function parseMajorUnitsToScaledMoney(value: string, currency: CurrencyCode): ScaledMoney {
  return moneyCatalog.parseMajorUnitsToScaledMoney(value, currency) as ScaledMoney
}
