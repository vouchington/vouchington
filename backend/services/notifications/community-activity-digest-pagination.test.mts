import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteUser,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { notificationsWorkConfig } from './work-limits.mts'
import { listCommunityActivityDigestRecipientPage } from './community-activity-digest-recipients.mts'

describe('community activity digest recipient pagination', () => {
  it('advances a bounded cursor across owned recipients and excludes an eligible peer', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        community_digest_recipient_batch_size: 1,
      }),
    )
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const neighbor = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: first.id })
    await Promise.all(
      [first, second, neighbor].map(user =>
        insertTestCommunityMember({
          communityId: community.id,
          userId: user.id,
          role: 'moderator',
        }),
      ),
    )
    const ids = [first.id, second.id]
    const page = await listCommunityActivityDigestRecipientPage(undefined, undefined, ids, 1)
    expect(page).toEqual({
      page: [{ user_id: first.id }],
      hasMore: true,
      nextUserId: first.id,
    })
    const next = await listCommunityActivityDigestRecipientPage(first.id, undefined, ids, 1)
    expect(next).toEqual({
      page: [{ user_id: second.id }],
      hasMore: false,
      nextUserId: null,
    })
    const done = await listCommunityActivityDigestRecipientPage(second.id, undefined, ids, 1)
    expect(done).toEqual({ page: [], hasMore: false, nextUserId: null })
  })

  it('counts each eligible user once before applying the page limit', async () => {
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
    const ids = [first.id, second.id].toSorted()
    const page = await listCommunityActivityDigestRecipientPage(undefined, undefined, ids, 1)
    expect(page).toEqual({ page: [{ user_id: ids[0] }], hasMore: true, nextUserId: ids[0] })
    const next = await listCommunityActivityDigestRecipientPage(page.nextUserId!, undefined, ids, 1)
    expect(next).toEqual({ page: [{ user_id: ids[1] }], hasMore: false, nextUserId: null })
  })

  it('advances past a deleted moderator without dropping the next live recipient', async () => {
    const liveBefore = await createTestUserDirect()
    const deleted = await createTestUserDirect()
    const liveAfter = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: liveBefore.id })
    for (const user of [liveBefore, deleted, liveAfter]) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'moderator',
      })
    }
    await softDeleteUser(deleted.id)
    const ids = [liveBefore.id, deleted.id, liveAfter.id].toSorted()

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await listCommunityActivityDigestRecipientPage(after, undefined, ids, 1)
      seen.push(...page.page.map(row => row.user_id))
      if (page.page.length === 0 && page.hasMore) emptyContinuation = true
      if (!page.hasMore) break
      after = page.nextUserId ?? undefined
    }

    expect(seen).toEqual([liveBefore.id, liveAfter.id].toSorted())
    expect(emptyContinuation).toBe(false)
  })
})
