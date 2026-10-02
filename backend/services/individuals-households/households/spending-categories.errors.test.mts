import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestSpendingCategory } from '@voucha/test-helpers'
import { createHouseholdSpendingCategory } from './spending-categories.mts'
import { getHouseholdSpendingCategoriesByUserId } from './spending-categories-get.mts'

describe('spending category database failures', () => {
  it('preserves an unexpected database error and leaves existing spending entries unchanged', async () => {
    const user = await createTestUser()
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const existing = await createHouseholdSpendingCategory(user, user, categoryId, {
      amount: { amount: 10_000, currency: 'usd' },
      note: 'Existing spending entry',
    })

    await expect(
      createHouseholdSpendingCategory(user, user, categoryId, {
        amount: { amount: 20_000, currency: 'usd' },
        note: 'Invalid\u0000note',
      }),
    ).rejects.toMatchObject({ code: '22021' })

    const page = await getHouseholdSpendingCategoriesByUserId(user, user, {
      spending_category_id: categoryId,
      readOnly: false,
    })
    expect(page.results).toEqual([existing])
  })
})
