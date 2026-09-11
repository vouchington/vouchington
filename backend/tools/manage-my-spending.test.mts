import { beforeAll, describe, expect, it } from 'vitest'
import manageMySpendingTool from './manage-my-spending.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestSpendingCategory } from '@voucha/test-helpers/entities/spending-categories'
import type { HouseholdSpendingCategoryPage } from '@services/individuals-households'
import type { PrivateUser } from '@services/users/types'

describe('manage_my_spending tool — real DB', () => {
  let user: PrivateUser
  let spendingCategoryId: string

  beforeAll(async () => {
    user = await createTestUser()
    spendingCategoryId = await insertTestSpendingCategory({ createdById: user.id })
  })

  it('describes spending amounts as currency-aware integer minor units', () => {
    const parameters = manageMySpendingTool.schema.parameters as {
      properties?: Record<string, { description?: string }>
    }

    expect(parameters.properties?.amount?.description).toContain('integer minor units')
    expect(parameters.properties?.amount?.description).toContain('currency')
  })

  it('lists the current user’s own spending category', async () => {
    const freshUser = await createTestUser()
    const categoryId = await insertTestSpendingCategory({ createdById: freshUser.id })
    const execute = manageMySpendingTool.function(freshUser)
    const added = (
      await execute({
        action: 'add',
        spending_category_id: categoryId,
        amount: { amount: 100, currency: 'usd' },
      })
    ).result as { id: string }

    const listed = await execute({ action: 'list' })
    expect(listed.success).toBe(true)
    const page = listed.result as HouseholdSpendingCategoryPage
    expect(page.results).toContainEqual(
      expect.objectContaining({
        id: added.id,
        spending_category_id: categoryId,
        amount: { amount: 100, currency: 'usd' },
        can_manage: true,
      }),
    )
  })

  it('add creates a spending category', async () => {
    const execute = manageMySpendingTool.function(user)
    const result = await execute({
      action: 'add',
      spending_category_id: spendingCategoryId,
      amount: { amount: 1_000_000, currency: 'usd' },
      spending_frequency: 'monthly',
      note: 'groceries',
    })
    expect(result.success).toBe(true)
    expect(result.result).toHaveProperty('id')
    expect((result.result as { amount: unknown }).amount).toEqual({
      amount: 1_000_000,
      currency: 'usd',
    })
    expect((result.result as { spending_category_id: string }).spending_category_id).toBe(
      spendingCategoryId,
    )
  })

  it('list after add returns the spending category', async () => {
    const execute = manageMySpendingTool.function(user)
    const result = await execute({ action: 'list' })
    expect(result.success).toBe(true)
    const page = result.result as HouseholdSpendingCategoryPage
    expect(
      page.results.some(category => category.spending_category_id === spendingCategoryId),
    ).toBe(true)
  })

  it('update modifies fields', async () => {
    const freshUser = await createTestUser()
    const catId = await insertTestSpendingCategory({ createdById: freshUser.id })
    const addExecute = manageMySpendingTool.function(freshUser)
    const added = (
      await addExecute({
        action: 'add',
        spending_category_id: catId,
        amount: { amount: 500_000, currency: 'usd' },
      })
    ).result as { id: string }

    const execute = manageMySpendingTool.function(freshUser)
    const result = await execute({
      action: 'update',
      id: added.id,
      amount: { amount: 800_000, currency: 'usd' },
      spending_frequency: 'annually',
      note: 'updated note',
    })
    expect(result.success).toBe(true)
    expect((result.result as { amount: unknown }).amount).toEqual({
      amount: 800_000,
      currency: 'usd',
    })
    expect((result.result as { spending_frequency: string }).spending_frequency).toBe('annually')
    expect((result.result as { note: string }).note).toBe('updated note')
  })

  it('remove deletes the spending category', async () => {
    const freshUser = await createTestUser()
    const catId = await insertTestSpendingCategory({ createdById: freshUser.id })
    const addExecute = manageMySpendingTool.function(freshUser)
    const added = (
      await addExecute({
        action: 'add',
        spending_category_id: catId,
        amount: { amount: 200_000, currency: 'usd' },
      })
    ).result as { id: string }

    const execute = manageMySpendingTool.function(freshUser)
    const result = await execute({ action: 'remove', id: added.id })
    expect(result.success).toBe(true)
    expect((result.result as { id: string }).id).toBe(added.id)
  })
})
