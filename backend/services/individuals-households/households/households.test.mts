import {
  createTestUserDirect,
  deleteOwnedHouseholdsForTestUser,
  deleteTestHouseholdMembership,
  insertTestHousehold,
  insertTestHouseholdMembership,
  insertTestHouseholdsAtPreciseTimestamps,
} from '@voucha/test-helpers'
import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHousehold, getOrCreateHousehold } from './households.mts'
import { getHouseholdMemberships, getHouseholdsByUser } from './household-lists.mts'

describe('households', () => {
  it('lists multiple owned households newest first without collapsing ownership', async () => {
    const user = await createTestUserDirect()
    await deleteOwnedHouseholdsForTestUser(user.id)
    const older = await insertTestHousehold(user.id, new Date('2026-01-01T00:00:00.000Z'))
    const newer = await insertTestHousehold(user.id, new Date('2026-01-02T00:00:00.000Z'))

    const page = await getHouseholdsByUser(user, { access: 'owned', limit: 25 })

    expect(page.results.map(household => household.id)).toEqual([newer.id, older.id])
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('filters owned, member-only, and all access without duplicating self memberships', async () => {
    const user = await createTestUserDirect()
    const otherOwner = await createTestUserDirect()
    const owned = await insertTestHousehold(user.id, new Date('2026-01-03T00:00:00.000Z'))
    const shared = await insertTestHousehold(otherOwner.id, new Date('2026-01-04T00:00:00.000Z'))
    await insertTestHouseholdMembership({
      householdId: owned.id,
      individualId: user.individual_id!,
    })
    await insertTestHouseholdMembership({
      householdId: shared.id,
      individualId: user.individual_id!,
    })

    const [ownedPage, memberPage, allPage] = await Promise.all([
      getHouseholdsByUser(user, { access: 'owned', limit: 100 }),
      getHouseholdsByUser(user, { access: 'member', limit: 100 }),
      getHouseholdsByUser(user, { access: 'all', limit: 100 }),
    ])

    expect(ownedPage.results.map(household => household.id)).toContain(owned.id)
    expect(memberPage.results.map(household => household.id)).toEqual([shared.id])
    expect(allPage.results.filter(household => household.id === owned.id)).toHaveLength(1)
    expect(allPage.results.map(household => household.id)).toContain(shared.id)
  })

  it('paginates empty, partial, exact, and multi-page household results', async () => {
    const emptyUser = await createTestUserDirect()
    await deleteOwnedHouseholdsForTestUser(emptyUser.id)
    const empty = await getHouseholdsByUser(emptyUser, { access: 'owned', limit: 2 })
    expect(empty).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const user = await createTestUserDirect()
    await deleteOwnedHouseholdsForTestUser(user.id)
    const rows = await Promise.all([
      insertTestHousehold(user.id, new Date('2026-02-01T00:00:00.000Z')),
      insertTestHousehold(user.id, new Date('2026-02-02T00:00:00.000Z')),
      insertTestHousehold(user.id, new Date('2026-02-03T00:00:00.000Z')),
    ])
    const first = await getHouseholdsByUser(user, { access: 'owned', limit: 2 })
    expect(first.results.map(household => household.id)).toEqual([rows[2]!.id, rows[1]!.id])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getHouseholdsByUser(user, {
      access: 'owned',
      after: first.page_info.end_cursor!,
      limit: 2,
    })
    expect(second.results.map(household => household.id)).toEqual([rows[0]!.id])
    expect(second.page_info.has_next_page).toBe(false)

    await deleteOwnedHouseholdsForTestUser(user.id)
    await Promise.all([
      insertTestHousehold(user.id, new Date('2026-03-01T00:00:00.000Z')),
      insertTestHousehold(user.id, new Date('2026-03-02T00:00:00.000Z')),
    ])
    const exact = await getHouseholdsByUser(user, { access: 'owned', limit: 2 })
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info.has_next_page).toBe(false)
  })

  it('uses household UUIDs to break equal updated-at ties without gaps or duplicates', async () => {
    const user = await createTestUserDirect()
    await deleteOwnedHouseholdsForTestUser(user.id)
    const timestamp = new Date('2026-04-01T00:00:00.123Z')
    const rows = await Promise.all([
      insertTestHousehold(user.id, timestamp),
      insertTestHousehold(user.id, timestamp),
      insertTestHousehold(user.id, timestamp),
    ])
    const expected = rows
      .map(row => row.id)
      .sort()
      .reverse()

    const first = await getHouseholdsByUser(user, { access: 'owned', limit: 1 })
    const second = await getHouseholdsByUser(user, {
      access: 'owned',
      after: first.page_info.end_cursor!,
      limit: 2,
    })

    expect([...first.results, ...second.results].map(household => household.id)).toEqual(expected)
  })

  it('preserves PostgreSQL microsecond ordering within one millisecond', async () => {
    const user = await createTestUserDirect()
    await deleteOwnedHouseholdsForTestUser(user.id)
    const rows = await insertTestHouseholdsAtPreciseTimestamps(user.id, [
      '2026-04-02T00:00:00.123001Z',
      '2026-04-02T00:00:00.123999Z',
      '2026-04-02T00:00:00.123500Z',
    ])
    const expected = rows
      .toSorted((a, b) => b.updated_at!.localeCompare(a.updated_at!) || b.id.localeCompare(a.id))
      .map(row => row.id)

    const traversed: string[] = []
    let after: string | undefined
    do {
      const page = await getHouseholdsByUser(user, { access: 'owned', after, limit: 1 })
      traversed.push(...page.results.map(household => household.id))
      after = page.page_info.end_cursor ?? undefined
    } while (after)

    expect(traversed).toEqual(expected)
  })

  it('rejects malformed and cross-user or cross-filter household cursors', async () => {
    const user = await createTestUserDirect()
    const otherUser = await createTestUserDirect()
    await insertTestHousehold(user.id)
    const first = await getHouseholdsByUser(user, { access: 'owned', limit: 1 })
    const after = first.page_info.end_cursor!

    await expect(
      getHouseholdsByUser(otherUser, { access: 'owned', after, limit: 1 }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getHouseholdsByUser(user, { access: 'member', after, limit: 1 }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getHouseholdsByUser(user, { access: 'owned', after: 'not-json', limit: 1 }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      getHouseholdsByUser(user, {
        access: 'owned',
        after: encodeCursor({ timestamp: 'not-precise', id: user.id, scope: 'wrong' }),
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('paginates memberships with a household-scoped precise timestamp cursor', async () => {
    const owner = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const members = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const rows = await Promise.all(
      members.map((member, index) =>
        insertTestHouseholdMembership({
          householdId: household.id,
          individualId: member!.individual_id!,
          updatedAt: new Date(`2026-05-0${index + 1}T00:00:00.000Z`),
        }),
      ),
    )

    const first = await getHouseholdMemberships(owner, household.id, { limit: 2 })
    const second = await getHouseholdMemberships(owner, household.id, {
      after: first.page_info.end_cursor!,
      limit: 2,
    })
    expect(first.results.map(membership => membership.id)).toEqual([rows[2]!.id, rows[1]!.id])
    expect(second.results.map(membership => membership.id)).toEqual([rows[0]!.id])
  })

  it('rejects membership cursor replay on a different household', async () => {
    const owner = await createTestUserDirect()
    const firstHousehold = await insertTestHousehold(owner.id)
    const secondHousehold = await insertTestHousehold(owner.id)
    const members = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    for (const member of members) {
      await insertTestHouseholdMembership({
        householdId: firstHousehold.id,
        individualId: member!.individual_id!,
      })
    }
    const first = await getHouseholdMemberships(owner, firstHousehold.id, { limit: 1 })

    await expect(
      getHouseholdMemberships(owner, secondHousehold.id, {
        after: first.page_info.end_cursor!,
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a continuation immediately after membership access is revoked', async () => {
    const owner = await createTestUserDirect()
    const member = await createTestUserDirect()
    const anotherMember = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    const access = await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: member.individual_id!,
    })
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: anotherMember.individual_id!,
    })
    const first = await getHouseholdMemberships(member, household.id, { limit: 1 })
    await deleteTestHouseholdMembership(access.id)

    await expect(
      getHouseholdMemberships(member, household.id, {
        after: first.page_info.end_cursor!,
        limit: 1,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('preserves owner, member, and administrator membership visibility', async () => {
    const owner = await createTestUserDirect()
    const member = await createTestUserDirect()
    const administrator = await createTestUserDirect({ administrator: true })
    const stranger = await createTestUserDirect()
    const household = await insertTestHousehold(owner.id)
    await insertTestHouseholdMembership({
      householdId: household.id,
      individualId: member.individual_id!,
    })

    const visiblePages = await Promise.all(
      [owner, member, administrator].map(viewer =>
        getHouseholdMemberships(viewer, household.id, { limit: 25 }),
      ),
    )
    for (const page of visiblePages) {
      expect(page.results).toHaveLength(1)
    }
    await expect(
      getHouseholdMemberships(stranger, household.id, { limit: 25 }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('returns household not found before role authorization for every caller class', async () => {
    const callers = await Promise.all([
      ...Array.from({ length: 3 }, () => createTestUserDirect()),
      createTestUserDirect({ administrator: true }),
    ])
    await Promise.all(
      callers.map(async caller => {
        await expect(
          getHouseholdMemberships(caller!, randomUUID(), { limit: 25 }),
        ).rejects.toMatchObject({ status: 404, message: 'Household not found' })
      }),
    )
  })

  it('creates a distinct household for every concurrent create request', async () => {
    const user = await createTestUserDirect()
    const created = await Promise.all(Array.from({ length: 4 }, () => createHousehold(user)))

    expect(new Set(created.map(household => household.id)).size).toBe(4)
  })

  it('deterministically returns the newest owned household from getOrCreateHousehold', async () => {
    const user = await createTestUserDirect()
    await deleteOwnedHouseholdsForTestUser(user.id)
    await insertTestHousehold(user.id, new Date('2026-06-01T00:00:00.000Z'))
    const newest = await insertTestHousehold(user.id, new Date('2026-06-02T00:00:00.000Z'))

    expect((await getOrCreateHousehold(user)).id).toBe(newest.id)
  })

  it('creates one household for a user and returns it on later access', async () => {
    const user = await createTestUserDirect()
    expect(await deleteOwnedHouseholdsForTestUser(user.id)).toBe(1)

    const created = await getOrCreateHousehold(user)
    const existing = await getOrCreateHousehold(user)

    expect(created.owner_id).toBe(user.id)
    expect(existing.id).toBe(created.id)
  })
})
