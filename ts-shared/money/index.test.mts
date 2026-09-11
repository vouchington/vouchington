import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  CURRENCIES,
  MAX_MONEY_AMOUNT,
  MONEY_SCALE,
  getCurrency,
  isCurrencyCode,
  isMoney,
  isMoneyRange,
  isScaledMoney,
  isScaledMoneyAggregate,
  parseMajorUnitsToMoney,
  parseMajorUnitsToScaledMoney,
  parsePostgresMoneyAmount,
} from './index.mts'

describe('currency catalog', () => {
  it('preserves the readonly currency tuple and code-to-exponent correlation', () => {
    expectTypeOf(CURRENCIES).toEqualTypeOf<
      readonly [
        { readonly code: 'usd'; readonly minor_unit_exponent: 2 },
        { readonly code: 'cad'; readonly minor_unit_exponent: 2 },
        { readonly code: 'eur'; readonly minor_unit_exponent: 2 },
        { readonly code: 'gbp'; readonly minor_unit_exponent: 2 },
        { readonly code: 'aud'; readonly minor_unit_exponent: 2 },
        { readonly code: 'jpy'; readonly minor_unit_exponent: 0 },
      ]
    >()
  })

  it('defines the supported lowercase currency codes and minor-unit exponents', () => {
    expect(CURRENCIES).toEqual([
      { code: 'usd', minor_unit_exponent: 2 },
      { code: 'cad', minor_unit_exponent: 2 },
      { code: 'eur', minor_unit_exponent: 2 },
      { code: 'gbp', minor_unit_exponent: 2 },
      { code: 'aud', minor_unit_exponent: 2 },
      { code: 'jpy', minor_unit_exponent: 0 },
    ])
    expect(isCurrencyCode('usd')).toBe(true)
    expect(isCurrencyCode('USD')).toBe(false)
    expect(getCurrency('jpy').minor_unit_exponent).toBe(0)
    expect(getCurrency('usd')).toBe(CURRENCIES[0])
  })

  it('reports the unsupported currency when an unsound caller bypasses the type', () => {
    expect(() => getCurrency('nzd' as Parameters<typeof getCurrency>[0])).toThrow(
      new TypeError('Unknown currency: nzd'),
    )
  })

  it('stays synchronized with the database currency catalog', () => {
    const root = new URL('../../', import.meta.url)
    const migration = readFileSync(
      new URL('backend/data-stores/psql/migrations/0000-00-00-core-functions-sites.sql', root),
      'utf8',
    )
    for (const currency of CURRENCIES) {
      expect(migration).toContain(`('${currency.code}', ${currency.minor_unit_exponent})`)
    }
  })
})

describe('money validation', () => {
  it('accepts non-negative JSON-safe integer amounts', () => {
    expect(isMoney({ amount: 0, currency: 'usd' })).toBe(true)
    expect(isMoney({ amount: MAX_MONEY_AMOUNT, currency: 'jpy' })).toBe(true)
  })

  it('rejects unsupported currencies and unsafe or fractional amounts', () => {
    expect(isMoney({ amount: 100, currency: 'USD' })).toBe(false)
    expect(isMoney({ amount: 100, currency: 'nzd' })).toBe(false)
    expect(isMoney({ amount: -1, currency: 'usd' })).toBe(false)
    expect(isMoney({ amount: 1.25, currency: 'usd' })).toBe(false)
    expect(isMoney({ amount: MAX_MONEY_AMOUNT + 1, currency: 'usd' })).toBe(false)
  })

  it('requires the exact plain Money shape', () => {
    expect(isMoney({ amount: 100, currency: 'usd', scale: MONEY_SCALE })).toBe(false)
    expect(isMoney({ amount: 100, currency: 'usd', note: 'extra' })).toBe(false)
    expect(isMoney(Object.assign(Object.create(null), { amount: 100, currency: 'usd' }))).toBe(true)
    expect(
      isMoney({
        amount: 100,
        currency: 'usd',
        [Symbol('extra')]: true,
      }),
    ).toBe(false)
    expect(
      isMoney(
        Object.create(
          {},
          {
            amount: { enumerable: true, value: 100 },
            currency: { enumerable: true, value: 'usd' },
          },
        ),
      ),
    ).toBe(false)
    expect(
      isMoney(
        Object.defineProperty({ currency: 'usd' }, 'amount', { enumerable: true, get: () => 100 }),
      ),
    ).toBe(false)
  })

  it('fails closed when an adversarial object throws during shape inspection', () => {
    const hostileMoney = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('prototype access denied')
        },
      },
    )

    expect(isMoney(hostileMoney)).toBe(false)
  })

  it('requires scaled money to use the canonical scale', () => {
    expect(isScaledMoney({ amount: 35_000, currency: 'usd', scale: MONEY_SCALE })).toBe(true)
    expect(isScaledMoney({ amount: 35_000, currency: 'usd', scale: 4 })).toBe(false)
    expect(
      isScaledMoney({ amount: 35_000, currency: 'usd', scale: MONEY_SCALE, note: 'extra' }),
    ).toBe(false)
  })

  it('accepts exact scaled aggregates beyond the JSON-safe integer range', () => {
    expect(
      isScaledMoneyAggregate({
        amount: '90071992547409910000',
        currency: 'usd',
        scale: MONEY_SCALE,
      }),
    ).toBe(true)
    expect(
      isScaledMoneyAggregate({
        amount: '090071992547409910000',
        currency: 'usd',
        scale: MONEY_SCALE,
      }),
    ).toBe(false)
    expect(
      isScaledMoneyAggregate({
        amount: MAX_MONEY_AMOUNT + 1,
        currency: 'usd',
        scale: MONEY_SCALE,
      }),
    ).toBe(false)
  })

  it('requires ranges to use one currency and an increasing exclusive maximum', () => {
    expect(
      isMoneyRange({
        minimum: { amount: 0, currency: 'usd' },
        maximum: { amount: 2_500_000, currency: 'usd' },
      }),
    ).toBe(true)
    expect(
      isMoneyRange({
        minimum: { amount: 2_500_000, currency: 'usd' },
        maximum: null,
      }),
    ).toBe(true)
    expect(
      isMoneyRange({
        minimum: { amount: 0, currency: 'usd' },
        maximum: { amount: 2_500_000, currency: 'cad' },
      }),
    ).toBe(false)
    expect(
      isMoneyRange({
        minimum: { amount: 100, currency: 'usd' },
        maximum: { amount: 100, currency: 'usd' },
      }),
    ).toBe(false)
    expect(
      isMoneyRange({
        minimum: { amount: 0, currency: 'usd' },
        maximum: null,
        scale: MONEY_SCALE,
      }),
    ).toBe(false)
  })

  it('converts PostgreSQL bigint strings only when they are canonical JSON-safe integers', () => {
    expect(parsePostgresMoneyAmount('0')).toBe(0)
    expect(parsePostgresMoneyAmount(String(MAX_MONEY_AMOUNT))).toBe(MAX_MONEY_AMOUNT)
    expect(() => parsePostgresMoneyAmount('-1')).toThrow(TypeError)
    expect(() => parsePostgresMoneyAmount(String(BigInt(MAX_MONEY_AMOUNT) + 1n))).toThrow(
      RangeError,
    )
    expect(() => parsePostgresMoneyAmount('1.0')).toThrow(TypeError)
  })
})

describe('major-unit parsing', () => {
  it('converts exact major-unit strings to currency minor units', () => {
    expect(parseMajorUnitsToMoney('12.34', 'usd')).toEqual({ amount: 1234, currency: 'usd' })
    expect(parseMajorUnitsToMoney('12', 'jpy')).toEqual({ amount: 12, currency: 'jpy' })
    expect(parseMajorUnitsToMoney('0', 'usd')).toEqual({ amount: 0, currency: 'usd' })
  })

  it('converts point values to scale-six microunits', () => {
    expect(parseMajorUnitsToScaledMoney('0.035', 'usd')).toEqual({
      amount: 35_000,
      currency: 'usd',
      scale: 6,
    })
  })

  it('rejects lossy, malformed, negative, and unsafe values', () => {
    expect(() => parseMajorUnitsToMoney('1.001', 'usd')).toThrow(RangeError)
    expect(() => parseMajorUnitsToScaledMoney('0.0350001', 'usd')).toThrow(RangeError)
    expect(() => parseMajorUnitsToMoney('-1', 'usd')).toThrow(TypeError)
    expect(() => parseMajorUnitsToMoney('1e2', 'usd')).toThrow(TypeError)
    expect(() => parseMajorUnitsToMoney(' 1.00', 'usd')).toThrow(TypeError)
    expect(() => parseMajorUnitsToMoney('90071992547409.92', 'usd')).toThrow(RangeError)
  })
})
