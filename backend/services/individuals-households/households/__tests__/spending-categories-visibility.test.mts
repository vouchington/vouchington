import {
  createTestUser,
  insertTestHouseholdMembership,
  insertTestSpendingCategory,
  mergeTopicForTest,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { beforeAll, describe, expect, it } from 'vitest'
import { createHousehold } from '../households.mts'
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
      expect.objectContaining({
        id: visibleEntry.id,
        spending_category_topic_id: visibleCategoryId,
      }),
    ])
  })

  it('lets household members view shared entries without managing them', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const household = await createHousehold(owner)
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
    const household = await createHousehold(owner)
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

    const targetHousehold = await createHousehold(target)
    const viewerHousehold = await createHousehold(viewer)
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

  it('merges personal and multi-household entries in id order across keyset pages', async () => {
    const viewer = await createTestUser()
    const ownerA = await createTestUser()
    const ownerB = await createTestUser()
    const ownedHousehold = await createHousehold(viewer)
    const memberHouseholdA = await createHousehold(ownerA)
    const memberHouseholdB = await createHousehold(ownerB)
    await insertTestHouseholdMembership({
      householdId: memberHouseholdA.id,
      individualId: viewer.individual_id!,
    })
    await insertTestHouseholdMembership({
      householdId: memberHouseholdB.id,
      individualId: viewer.individual_id!,
    })
    const [topicPersonal, topicOwned, topicMemberA, topicMemberB, deletedTopic] = await Promise.all(
      [
        insertTestSpendingCategory({ createdById: viewer.id }),
        insertTestSpendingCategory({ createdById: viewer.id }),
        insertTestSpendingCategory({ createdById: ownerA.id }),
        insertTestSpendingCategory({ createdById: ownerB.id }),
        insertTestSpendingCategory({ createdById: ownerA.id }),
      ],
    )

    // Interleave inserts across personal and three households so global id order crosses sources.
    const e1 = await createHouseholdSpendingCategory(
      ownerA,
      ownerA,
      topicMemberA,
      { amount: { amount: 100, currency: 'usd' } },
      memberHouseholdA.id,
    )
    const e2 = await createHouseholdSpendingCategory(viewer, viewer, topicPersonal, {
      amount: { amount: 200, currency: 'usd' },
    })
    const hidden = await createHouseholdSpendingCategory(
      ownerA,
      ownerA,
      deletedTopic,
      { amount: { amount: 250, currency: 'usd' } },
      memberHouseholdA.id,
    )
    await softDeleteTopic(deletedTopic, ownerA.id)
    const e3 = await createHouseholdSpendingCategory(
      ownerB,
      ownerB,
      topicMemberB,
      { amount: { amount: 300, currency: 'usd' } },
      memberHouseholdB.id,
    )
    const e4 = await createHouseholdSpendingCategory(
      viewer,
      viewer,
      topicOwned,
      { amount: { amount: 400, currency: 'usd' } },
      ownedHousehold.id,
    )
    const e5 = await createHouseholdSpendingCategory(
      ownerA,
      ownerA,
      topicMemberA,
      { amount: { amount: 500, currency: 'usd' } },
      memberHouseholdA.id,
    )
    if (!e1 || !e2 || !hidden || !e3 || !e4 || !e5) {
      throw new Error('Expected all spending entries')
    }
    const expectedIds = [e1.id, e2.id, e3.id, e4.id, e5.id].toSorted()

    const page1 = await getHouseholdSpendingCategoriesByUserId(viewer, viewer, { limit: 2 })
    expect(page1.results.map(entry => entry.id)).toEqual(expectedIds.slice(0, 2))
    expect(page1.page_info.has_next_page).toBe(true)

    const page2 = await getHouseholdSpendingCategoriesByUserId(viewer, viewer, {
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.map(entry => entry.id)).toEqual(expectedIds.slice(2, 4))
    expect(page2.page_info.has_next_page).toBe(true)

    const page3 = await getHouseholdSpendingCategoriesByUserId(viewer, viewer, {
      limit: 2,
      after: page2.page_info.end_cursor!,
    })
    expect(page3.results.map(entry => entry.id)).toEqual(expectedIds.slice(4))
    expect(page3.page_info.has_next_page).toBe(false)

    const all = [...page1.results, ...page2.results, ...page3.results]
    expect(all.some(entry => entry.id === hidden.id)).toBe(false)
    expect(all.find(entry => entry.id === e1.id)).toMatchObject({
      owner_type: 'household',
      can_manage: false,
    })
    expect(all.find(entry => entry.id === e2.id)).toMatchObject({
      owner_type: 'individual',
      can_manage: true,
    })
    expect(all.find(entry => entry.id === e4.id)).toMatchObject({
      owner_type: 'household',
      can_manage: true,
    })
  })
})
