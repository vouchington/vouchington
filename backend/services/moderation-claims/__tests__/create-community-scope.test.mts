import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { claimModerationQueueItem, releaseModerationQueueItem } from '../create.mts'

async function createOwnedCommunity(ownerId: string) {
  const community = await insertTestCommunity({ createdById: ownerId })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}

describe('releaseModerationQueueItem community scoping', () => {
  it('does not release a report claim through another community scope', async () => {
    const [mod1, mod2, postAuthor, reporter] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    expect(mod1 && mod2 && postAuthor && reporter).toBeTruthy()

    const community = await createOwnedCommunity(mod1!.id)
    const otherCommunity = await createOwnedCommunity(mod1!.id)
    const postId = await insertTestPost({
      createdById: postAuthor!.id,
      slug: `claim-release-cross-community-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Claim Release Cross Community',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter!.id,
      entityType: 'post',
      entityId: postId,
    })

    await claimModerationQueueItem(mod1!.id, { communityId: community.id, reportId })
    await expect(
      releaseModerationQueueItem(mod1!.id, { communityId: otherCommunity.id, reportId }),
    ).rejects.toMatchObject({ status: 403 })

    const result = await claimModerationQueueItem(mod2!.id, { communityId: community.id, reportId })
    expect(result.claimed_by_other).toBe(true)
    expect(result.claim.claimed_by_id).toBe(mod1!.id)
  })
})
