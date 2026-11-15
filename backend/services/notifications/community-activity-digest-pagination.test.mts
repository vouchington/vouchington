import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteUser,
  archiveTestCommunity,
  removeTestCommunityMember,
  suspendTestUser,
} from '@voucha/test-helpers'
import { createCommunityActivityDigestBatch } from './community-activity-digest.mts'
import {
  findCommunityActivityDigestThroughUserId,
  listCommunityActivityDigestRecipientPage,
} from './community-activity-digest-recipients.mts'

describe('community activity digest recipient pagination', () => {
  it('advances across owned recipients and excludes an eligible peer', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const neighbor = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: first.id })
    for (const user of [first, second, neighbor]) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'moderator',
      })
    }
    const ids = [first.id, second.id]
    expect(await findCommunityActivityDigestThroughUserId(ids)).toBe(second.id)
    expect(await listCommunityActivityDigestRecipientPage(undefined, second.id, ids, 1)).toEqual({
      page: [{ user_id: first.id }],
      hasMore: true,
      nextUserId: first.id,
      nextCommunityId: null,
    })
    expect(await listCommunityActivityDigestRecipientPage(first.id, second.id, ids, 1)).toEqual({
      page: [{ user_id: second.id }],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
    expect(await listCommunityActivityDigestRecipientPage(second.id, second.id, ids, 1)).toEqual({
      page: [],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
  })

  it('does not inspect memberships beyond the fixed user boundary', async () => {
    const first = await createTestUserDirect()
    const later = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: first.id })
    for (const user of [first, later]) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'moderator',
      })
    }
    expect(
      await listCommunityActivityDigestRecipientPage(undefined, first.id, [first.id, later.id], 1),
    ).toEqual({
      page: [{ user_id: first.id }],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
  })

  it('preserves continuation after an inspected page with no eligible recipient', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const archived = await insertTestCommunity({ createdById: first.id })
    const live = await insertTestCommunity({ createdById: second.id })
    await insertTestCommunityMember({
      communityId: archived.id,
      userId: first.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({ communityId: live.id, userId: second.id, role: 'moderator' })
    await archiveTestCommunity({ communityId: archived.id, archivedById: first.id })
    const result = await createCommunityActivityDigestBatch({
      windowStart: new Date('2026-10-25T00:00:00Z'),
      windowEnd: new Date('2026-11-01T00:00:00Z'),
      userIds: [first.id, second.id],
      throughUserId: second.id,
      batchSize: 1,
    })
    expect(result).toEqual({ created: [], nextUserId: first.id, nextCommunityId: archived.id })
    expect(
      await listCommunityActivityDigestRecipientPage(
        result.nextUserId!,
        second.id,
        [first.id, second.id],
        1,
        result.nextCommunityId,
      ),
    ).toEqual({
      page: [{ user_id: second.id }],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
  })

  it('emits each eligible user once even when memberships cross a page boundary', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const communities = await Promise.all([
      insertTestCommunity({ createdById: first.id }),
      insertTestCommunity({ createdById: first.id }),
    ])
    for (const community of communities) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: first.id,
        role: 'moderator',
      })
    }
    await insertTestCommunityMember({
      communityId: communities[0]!.id,
      userId: second.id,
      role: 'moderator',
    })
    const ids = [first.id, second.id]
    const page = await listCommunityActivityDigestRecipientPage(undefined, second.id, ids, 1)
    expect(page).toEqual({
      page: [{ user_id: first.id }],
      hasMore: true,
      nextUserId: first.id,
      nextCommunityId: null,
    })
    expect(
      await listCommunityActivityDigestRecipientPage(
        page.nextUserId!,
        second.id,
        ids,
        1,
        page.nextCommunityId,
      ),
    ).toEqual({
      page: [{ user_id: second.id }],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
  })

  it('resumes inside ineligible membership runs and follows the last inspected user', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const communities = []
    for (let index = 0; index < 6; index++)
      communities.push(await insertTestCommunity({ createdById: first.id }))
    for (const [index, community] of communities.entries()) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: index < 3 ? first.id : second.id,
        role: 'moderator',
      })
    }
    for (const community of [communities[0]!, communities[1]!, communities[3]!]) {
      await archiveTestCommunity({ communityId: community.id, archivedById: first.id })
    }
    const ids = [first.id, second.id]
    const firstPage = await listCommunityActivityDigestRecipientPage(undefined, second.id, ids, 2)
    expect(firstPage).toEqual({
      page: [],
      hasMore: true,
      nextUserId: first.id,
      nextCommunityId: communities[1]!.id,
    })
    const middle = await listCommunityActivityDigestRecipientPage(
      firstPage.nextUserId!,
      second.id,
      ids,
      2,
      firstPage.nextCommunityId,
    )
    expect(middle).toEqual({
      page: [{ user_id: first.id }],
      hasMore: true,
      nextUserId: second.id,
      nextCommunityId: communities[3]!.id,
    })
    expect(
      await listCommunityActivityDigestRecipientPage(
        middle.nextUserId!,
        second.id,
        ids,
        2,
        middle.nextCommunityId,
      ),
    ).toEqual({
      page: [{ user_id: second.id }],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
  })

  it('excludes removed, archived and suspended memberships', async () => {
    const users = await Promise.all(Array.from({ length: 4 }, () => createTestUserDirect()))
    const communities = await Promise.all(
      users.map(user => insertTestCommunity({ createdById: user.id })),
    )
    for (const [index, user] of users.entries()) {
      await insertTestCommunityMember({
        communityId: communities[index]!.id,
        userId: user.id,
        role: 'moderator',
      })
    }
    await removeTestCommunityMember(communities[0]!.id, users[0]!.id)
    await archiveTestCommunity({ communityId: communities[1]!.id, archivedById: users[1]!.id })
    await suspendTestUser(users[2]!.id)
    expect(
      await listCommunityActivityDigestRecipientPage(
        undefined,
        undefined,
        users.map(user => user.id),
        4,
      ),
    ).toEqual({
      page: [{ user_id: users[3]!.id }],
      hasMore: false,
      nextUserId: null,
      nextCommunityId: null,
    })
  })

  it('advances past a deleted moderator without dropping a live recipient', async () => {
    const first = await createTestUserDirect()
    const deleted = await createTestUserDirect()
    const last = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: first.id })
    for (const user of [first, deleted, last]) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'moderator',
      })
    }
    await softDeleteUser(deleted.id)
    const ids = [first.id, deleted.id, last.id]
    let afterUserId: string | undefined
    let afterCommunityId: string | null = null
    const seen: string[] = []
    let emptyContinuation = false
    for (let step = 0; step < 4; step++) {
      const page = await listCommunityActivityDigestRecipientPage(
        afterUserId,
        last.id,
        ids,
        1,
        afterCommunityId,
      )
      seen.push(...page.page.map(row => row.user_id))
      if (page.page.length === 0 && page.hasMore) emptyContinuation = true
      if (!page.hasMore) break
      afterUserId = page.nextUserId ?? undefined
      afterCommunityId = page.nextCommunityId
    }
    expect(seen).toEqual([first.id, last.id])
    expect(emptyContinuation).toBe(true)
  })
})
