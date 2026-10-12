import { describe, expect, it } from 'vitest'
import { getCurrencyCodeEnumLabels } from '../../test-helpers/data-stores/psql/currencies.mts'
import { encodeCursor } from '@modules/pagination'
import { CURRENCIES } from '@ts-shared/money'
import { listCurrencies } from './currencies.mts'

describe('currency catalog', () => {
  it('keeps database enum labels in shared catalog order', async () => {
    expect(await getCurrencyCodeEnumLabels()).toEqual(
      CURRENCIES.map(currency => currency.code).toSorted(),
    )
  })

  it('returns the seeded Stripe-style currency codes and minor-unit exponents', async () => {
    const page = await listCurrencies({ limit: 25 })
    expect(page.results).toEqual([
      { code: 'aud', minor_unit_exponent: 2 },
      { code: 'cad', minor_unit_exponent: 2 },
      { code: 'eur', minor_unit_exponent: 2 },
      { code: 'gbp', minor_unit_exponent: 2 },
      { code: 'jpy', minor_unit_exponent: 0 },
      { code: 'usd', minor_unit_exponent: 2 },
    ])
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('paginates with an opaque cursor', async () => {
    const first = await listCurrencies({ limit: 2 })
    expect(first.results).toHaveLength(2)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await listCurrencies({ limit: 2, after: first.page_info.end_cursor! })
    expect(second.results).toHaveLength(2)
    expect(second.results[0]!.code).not.toBe(first.results[0]!.code)
  })

  it('rejects a structurally valid cursor for an unsupported currency', async () => {
    const after = encodeCursor({ name: 'bhd', id: 'bhd' })

    await expect(listCurrencies({ after })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid currency cursor',
    })
  })
})
