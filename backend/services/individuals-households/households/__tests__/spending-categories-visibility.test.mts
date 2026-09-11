import {
  createTestUser,
  insertTestHouseholdMembership,
  insertTestSpendingCategory,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import { getOrCreateHousehold } from '../households.mts'
import {
  createHouseholdSpendingCategory,
  deleteHouseholdSpendingCategoryById,
  updateHouseholdSpendingCategoryById,
} from '../spending-categories.mts'
import { getHouseholdSpendingCategoriesByUserId } from '../spending-categories-get.mts'
import { updateUserFields } from '@services/users/update-fields'
import type { PrivateUser } from '@services/users/types'

describe('spending category visibility', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('applies topic visibility before the page limit', async () => {
    const hiddenCategoryIds = await Promise.all(
      Array.from({ length: 26 }, () => insertTestSpendingCategory({ createdById: user.id })),
    )
    await Promise.all(
      hiddenCategoryIds.map(categoryId =>
        createHouseholdSpendingCategory(user, user, categoryId, {
          amount: { amount: 100, currency: 'usd' },
        }),
      ),
    )
    const mergeDestinationId = await insertTestSpendingCategory({ createdById: user.id })
    await Promise.all(
      hiddenCategoryIds.map((categoryId, index) =>
        index % 2 === 0
          ? softDeleteTopic(categoryId, user.id)
          : mergeTopicForTest(categoryId, mergeDestinationId, user.id),
      ),
    )
    const visibleCategoryId = await insertTestSpendingCategory({ createdById: user.id })
    const visibleEntry = await createHouseholdSpendingCategory(user, user, visibleCategoryId, {
      amount: { amount: 200, currency: 'usd' },
    })
    if (!visibleEntry) throw new Error('Expected visible spending entry')

    const page = await getHouseholdSpendingCategoriesByUserId(user, user, { limit: 1 })

    expect(page.results).toEqual([
      expect.objectContaining({ id: visibleEntry.id, spending_category_id: visibleCategoryId }),
    ])
  })

  it('lets household members view shared entries without managing them', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const household = await getOrCreateHousehold(owner)
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: member.individual_id!,
    })
    const topicId = await insertTestSpendingCategory({ createdById: owner.id })
    const sharedEntry = await createHouseholdSpendingCategory(
      owner,
      owner,
      topicId,
      { amount: { amount: 10_000, currency: 'usd' } },
      household.id,
    )
    if (!sharedEntry) throw new Error('Expected shared spending entry')

    const ownerEntry = (await getHouseholdSpendingCategoriesByUserId(owner, owner)).results.find(
      entry => entry.id === sharedEntry.id,
    )
    const memberEntry = (await getHouseholdSpendingCategoriesByUserId(member, member)).results.find(
      entry => entry.id === sharedEntry.id,
    )

    expect(ownerEntry).toMatchObject({ can_manage: true, owner_type: 'household' })
    expect(memberEntry).toMatchObject({ can_manage: false, owner_type: 'household' })
    await expect(
      updateHouseholdSpendingCategoryById(member, member, sharedEntry.id, {
        amount: { amount: 20_000, currency: 'usd' },
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(deleteHouseholdSpendingCategoryById(member, sharedEntry.id)).rejects.toMatchObject(
      {
        status: 403,
      },
    )
  })

  it('lets a household owner update a shared entry while viewing another member profile', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    await updateUserFields(member.id, { spending_categories_visibility: 'users' })
    const household = await getOrCreateHousehold(owner)
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: member.individual_id!,
    })
    const topicId = await insertTestSpendingCategory({ createdById: owner.id })
    const sharedEntry = await createHouseholdSpendingCategory(
      owner,
      owner,
      topicId,
      { amount: { amount: 10_000, currency: 'usd' } },
      household.id,
    )
    if (!sharedEntry) throw new Error('Expected shared spending entry')

    const updated = await updateHouseholdSpendingCategoryById(owner, member, sharedEntry.id, {
      amount: { amount: 20_000, currency: 'usd' },
    })

    expect(updated).toMatchObject({
      id: sharedEntry.id,
      amount: { amount: 20_000, currency: 'usd' },
      can_manage: true,
    })
  })

  it('calculates management capability for the viewer, not the target profile', async () => {
    const viewer = await createTestUser()
    const target = await createTestUser()
    await updateUserFields(target.id, { spending_categories_visibility: 'everyone' })

    const targetHousehold = await getOrCreateHousehold(target)
    const viewerHousehold = await getOrCreateHousehold(viewer)
    await insertTestHouseholdMembership({
      householdId: viewerHousehold.id,
      individualId: target.individual_id!,
    })
    const [personalTopicId, targetHouseholdTopicId, viewerHouseholdTopicId] = await Promise.all([
      insertTestSpendingCategory({ createdById: target.id }),
      insertTestSpendingCategory({ createdById: target.id }),
      insertTestSpendingCategory({ createdById: viewer.id }),
    ])
    const [personalEntry, targetHouseholdEntry, viewerHouseholdEntry] = await Promise.all([
      createHouseholdSpendingCategory(target, target, personalTopicId, {
        amount: { amount: 100, currency: 'usd' },
      }),
      createHouseholdSpendingCategory(
        target,
        target,
        targetHouseholdTopicId,
        { amount: { amount: 200, currency: 'usd' } },
        targetHousehold.id,
      ),
      createHouseholdSpendingCategory(
        viewer,
        viewer,
        viewerHouseholdTopicId,
        { amount: { amount: 300, currency: 'usd' } },
        viewerHousehold.id,
      ),
    ])
    if (!personalEntry || !targetHouseholdEntry || !viewerHouseholdEntry) {
      throw new Error('Expected all spending entries')
    }

    const entries = (await getHouseholdSpendingCategoriesByUserId(viewer, target, { limit: 100 }))
      .results
    const byId = new Map(entries.map(entry => [entry.id, entry]))

    expect(byId.get(personalEntry.id)).toMatchObject({ can_manage: false })
    expect(byId.get(targetHouseholdEntry.id)).toMatchObject({ can_manage: false })
    expect(byId.get(viewerHouseholdEntry.id)).toMatchObject({ can_manage: true })
  })
})
