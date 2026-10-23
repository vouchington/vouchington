import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteForeignKeyTargetDuringInsertForTest,
  insertTestSpendingCategory,
} from '@voucha/test-helpers'
import { createHouseholdSpendingCategory } from './spending-categories.mts'
import { getHouseholdSpendingCategoriesByUserId } from './spending-categories-get.mts'

describe('spending category database failures', () => {
  it('returns not found when a category is deleted during the insert FK check', async () => {
    const user = await createTestUser()
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createHouseholdSpendingCategory */',
      lockTarget: async query => {
        await query(
          '/* lockTestSpendingCategoryTopic */ SELECT topic_id FROM spending_category_topics WHERE topic_id = $1 FOR UPDATE',
          [categoryId],
        )
      },
      deleteTarget: async query => {
        await query(
          '/* deleteTestSpendingCategoryTopic */ DELETE FROM spending_category_topics WHERE topic_id = $1',
          [categoryId],
        )
      },
      operation: () =>
        createHouseholdSpendingCategory(user, user, categoryId, {
          amount: { amount: 10_000, currency: 'usd' },
        }),
    })

    expect(outcome).toMatchObject({ error: { status: 404, message: 'Topic not found' } })
  })

  it('preserves the former validation response when the owner FK fails during insert', async () => {
    const user = await createTestUser()
    const categoryId = await insertTestSpendingCategory({ createdById: user.id })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createHouseholdSpendingCategory */',
      lockTarget: async query => {
        await query(
          '/* lockTestSpendingOwner */ SELECT id FROM individuals WHERE id = $1 FOR UPDATE',
          [user.individual_id!],
        )
      },
      deleteTarget: async query => {
        await query('/* deleteTestSpendingOwner */ DELETE FROM individuals WHERE id = $1', [
          user.individual_id!,
        ])
      },
      operation: () =>
        createHouseholdSpendingCategory(user, user, categoryId, {
          amount: { amount: 10_000, currency: 'usd' },
        }),
    })

    expect(outcome).toMatchObject({
      error: { status: 422, message: 'Invalid spending_category_topic_id' },
    })
  })

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
      spending_category_topic_id: categoryId,
      readOnly: false,
    })
    expect(page.results).toEqual([existing])
  })
})
