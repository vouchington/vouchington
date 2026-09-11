import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientApi } from '@/lib/api/client/instance'
import { createMySpendingCategory, updateMySpendingCategory } from '../my'
import type { Money } from '@ts-shared/money'

type ClientApi = typeof import('@/lib/api/client/instance').clientApi

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        patch: vi.fn<ClientApi['patch']>(),
        post: vi.fn<ClientApi['post']>(),
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

const mockedClientApi = vi.mocked(clientApi)
const spendingCategoryId = '00000000-0000-7000-8000-000000000741'

describe('spending category client helpers', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    { amount: 1.25, currency: 'usd' },
    { amount: Number.NaN, currency: 'usd' },
    { amount: Number.MAX_SAFE_INTEGER + 1, currency: 'usd' },
    { amount: 100, currency: 'nzd' },
  ])('rejects invalid create money before sending a request', amount => {
    expect(() =>
      createMySpendingCategory({
        spending_category_id: spendingCategoryId,
        amount: amount as Money,
      }),
    ).toThrow('amount must be valid money')
    expect(mockedClientApi.post).not.toHaveBeenCalled()
  })

  it.each([
    { amount: 1.25, currency: 'usd' },
    { amount: Number.NaN, currency: 'usd' },
    { amount: Number.MAX_SAFE_INTEGER + 1, currency: 'usd' },
    { amount: 100, currency: 'nzd' },
  ])('rejects invalid update money before sending a request', amount => {
    expect(() => updateMySpendingCategory(spendingCategoryId, { amount: amount as Money })).toThrow(
      'amount must be valid money',
    )
    expect(mockedClientApi.patch).not.toHaveBeenCalled()
  })
})
