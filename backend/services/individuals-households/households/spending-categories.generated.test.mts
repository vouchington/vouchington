import { createTestUser, insertTestSpendingCategory } from '@voucha/test-helpers'
import { it, expect, beforeAll, describe } from 'vitest'
import {
  getHouseholdSpendingCategoriesByUserId,
  getHouseholdSpendingCategoryById,
} from './spending-categories-get.mts'
import {
  createHouseholdSpendingCategory,
  updateHouseholdSpendingCategoryById,
  deleteHouseholdSpendingCategoryById,
} from './spending-categories.mts'
import { getOrCreateHousehold } from './households.mts'
import type { PrivateUser } from '@services/users/types'

describe('spending-categories.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('createHouseholdSpendingCategory - creates a spending category', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    const spendingCategory = await createHouseholdSpendingCategory(user, user, topicId, {
      amount: { amount: 10_050, currency: 'usd' },
      spending_frequency: 'monthly',
    })

    expect(spendingCategory).toBeDefined()
    expect(spendingCategory!.amount).toEqual({ amount: 10_050, currency: 'usd' })
    expect(spendingCategory!.spending_frequency).toBe('monthly')
    expect(spendingCategory!.spending_category_id).toBe(topicId)
    expect(spendingCategory!.spending_category).toBeDefined()
    expect(spendingCategory!.spending_category.id).toBe(topicId)
    expect(spendingCategory!.owner_type).toBe('individual')
  })

  it('createHouseholdSpendingCategory - requires authentication', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    await expect(
      createHouseholdSpendingCategory(null, user, topicId, {
        amount: { amount: 10_000, currency: 'usd' },
      }),
    ).rejects.toThrow(Error)
  })

  it('createHouseholdSpendingCategory - validates amount', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    await expect(
      createHouseholdSpendingCategory(user, user, topicId, {
        amount: { amount: Number.NaN, currency: 'usd' },
      }),
    ).rejects.toThrow(Error)
  })

  it('getHouseholdSpendingCategoriesByUserId - returns user spending categories', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    const created = await createHouseholdSpendingCategory(user, user, topicId, {
      amount: { amount: 20_000, currency: 'usd' },
      spending_frequency: 'annually',
    })
    const categories = await getHouseholdSpendingCategoriesByUserId(user, user)

    expect(categories).toBeDefined()
    expect(categories.results.length).toBeGreaterThan(0)
    expect(categories.results.some(c => c.id === created!.id)).toBe(true)
  })

  it('getHouseholdSpendingCategoriesByUserId - applies entry filters before the page limit', async () => {
    const topicId = await insertTestSpendingCategory({ createdById: user.id })
    const entries = await Promise.all(
      Array.from({ length: 26 }, (_, index) =>
        createHouseholdSpendingCategory(user, user, topicId, {
          amount: { amount: index, currency: 'usd' },
        }),
      ),
    )
    const target = entries[25]!

    const page = await getHouseholdSpendingCategoriesByUserId(user, user, {
      entry_id: target.id,
      limit: 1,
    })

    expect(page.results).toHaveLength(1)
    expect(page.results[0]?.id).toBe(target.id)
  })

  it('updateHouseholdSpendingCategoryById - updates spending category', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    const created = await createHouseholdSpendingCategory(user, user, topicId, {
      amount: { amount: 10_000, currency: 'usd' },
    })
    const updated = await updateHouseholdSpendingCategoryById(user, user, created!.id, {
      amount: { amount: 15_000, currency: 'usd' },
      spending_frequency: 'monthly',
    })

    expect(updated).toBeDefined()
    expect(updated!.amount).toEqual({ amount: 15_000, currency: 'usd' })
    expect(updated!.spending_frequency).toBe('monthly')
    expect(updated!.spending_category).toBeDefined()
    expect(updated!.spending_category.id).toBe(topicId)
  })

  it('updateHouseholdSpendingCategoryById - throws 404 for unknown id', async () => {
    await expect(
      updateHouseholdSpendingCategoryById(user, user, '00000000-0000-7000-8000-000000000000', {
        amount: { amount: 10_000, currency: 'usd' },
      }),
    ).rejects.toThrow(Error)
  })

  it('getHouseholdSpendingCategoryById - returns specific category', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    const created = await createHouseholdSpendingCategory(user, user, topicId, {
      amount: { amount: 30_000, currency: 'usd' },
    })
    const retrieved = await getHouseholdSpendingCategoryById(user, user, created!.id)

    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(created!.id)
    expect(retrieved!.amount).toEqual({ amount: 30_000, currency: 'usd' })
  })

  it('deleteHouseholdSpendingCategoryById - throws 404 for unknown id', async () => {
    await expect(
      deleteHouseholdSpendingCategoryById(user, '00000000-0000-7000-8000-000000000000'),
    ).rejects.toThrow(Error)
  })

  it('createHouseholdSpendingCategory - throws 422 for negative amount', async () => {
    const topicId = await insertTestSpendingCategory({ createdById: user.id })
    await expect(
      createHouseholdSpendingCategory(user, user, topicId, {
        amount: { amount: -50, currency: 'usd' },
      }),
    ).rejects.toThrow(Error)
  })

  it('deleteHouseholdSpendingCategoryById - deletes category', async () => {
    const topicId = await insertTestSpendingCategory({
      createdById: user.id,
    })
    const created = await createHouseholdSpendingCategory(user, user, topicId, {
      amount: { amount: 10_000, currency: 'usd' },
    })
    await deleteHouseholdSpendingCategoryById(user, created!.id)

    const retrieved = await getHouseholdSpendingCategoryById(user, user, created!.id)
    expect(retrieved).toBeUndefined()
  })

  // Household-level spending category tests

  it('createHouseholdSpendingCategory - creates a household-level spending entry', async () => {
    const topicId = await insertTestSpendingCategory({ createdById: user.id })
    const household = await getOrCreateHousehold(user)
    const spendingCategory = await createHouseholdSpendingCategory(
      user,
      user,
      topicId,
      { amount: { amount: 15_000, currency: 'usd' }, spending_frequency: 'monthly' },
      household.id,
    )

    expect(spendingCategory).toBeDefined()
    expect(spendingCategory!.amount).toEqual({ amount: 15_000, currency: 'usd' })
    expect(spendingCategory!.owner_type).toBe('household')
    expect(spendingCategory!.can_manage).toBe(true)
    expect(spendingCategory!.spending_category_id).toBe(topicId)
  })

  it('getHouseholdSpendingCategoriesByUserId - returns both individual and household entries', async () => {
    const isolatedUser = await createTestUser()
    const topicId1 = await insertTestSpendingCategory({ createdById: isolatedUser.id })
    const topicId2 = await insertTestSpendingCategory({ createdById: isolatedUser.id })
    const household = await getOrCreateHousehold(isolatedUser)

    const individualEntry = await createHouseholdSpendingCategory(
      isolatedUser,
      isolatedUser,
      topicId1,
      {
        amount: { amount: 10_000, currency: 'usd' },
      },
    )
    const householdEntry = await createHouseholdSpendingCategory(
      isolatedUser,
      isolatedUser,
      topicId2,
      { amount: { amount: 20_000, currency: 'jpy' } },
      household.id,
    )

    const categories = await getHouseholdSpendingCategoriesByUserId(isolatedUser, isolatedUser)

    const foundIndividual = categories.results.find(c => c.id === individualEntry!.id)
    const foundHousehold = categories.results.find(c => c.id === householdEntry!.id)

    expect(foundIndividual).toBeDefined()
    if (!foundIndividual) throw new Error('Expected individual spending entry')
    expect(foundIndividual.owner_type).toBe('individual')
    expect(foundHousehold).toBeDefined()
    if (!foundHousehold) throw new Error('Expected household spending entry')
    expect(foundHousehold.owner_type).toBe('household')
    expect(foundHousehold.can_manage).toBe(true)
    expect(foundHousehold.amount).toEqual({ amount: 20_000, currency: 'jpy' })
  })

  it('createHouseholdSpendingCategory - non-owner cannot create household entry', async () => {
    const otherUser = await createTestUser()
    const household = await getOrCreateHousehold(user)
    const topicId = await insertTestSpendingCategory({ createdById: user.id })

    await expect(
      createHouseholdSpendingCategory(
        otherUser,
        otherUser,
        topicId,
        { amount: { amount: 10_000, currency: 'usd' } },
        household.id,
      ),
    ).rejects.toThrow(Error)
  })

  it('updateHouseholdSpendingCategoryById - updates household spending entry', async () => {
    const topicId = await insertTestSpendingCategory({ createdById: user.id })
    const household = await getOrCreateHousehold(user)
    const created = await createHouseholdSpendingCategory(
      user,
      user,
      topicId,
      { amount: { amount: 10_000, currency: 'usd' } },
      household.id,
    )
    const updated = await updateHouseholdSpendingCategoryById(user, user, created!.id, {
      amount: { amount: 250, currency: 'jpy' },
    })

    expect(updated).toBeDefined()
    expect(updated!.amount).toEqual({ amount: 250, currency: 'jpy' })
    expect(updated!.owner_type).toBe('household')
  })

  it('deleteHouseholdSpendingCategoryById - deletes household spending entry', async () => {
    const topicId = await insertTestSpendingCategory({ createdById: user.id })
    const household = await getOrCreateHousehold(user)
    const created = await createHouseholdSpendingCategory(
      user,
      user,
      topicId,
      { amount: { amount: 10_000, currency: 'usd' } },
      household.id,
    )
    await deleteHouseholdSpendingCategoryById(user, created!.id)

    const retrieved = await getHouseholdSpendingCategoryById(user, user, created!.id)
    expect(retrieved).toBeUndefined()
  })
})
