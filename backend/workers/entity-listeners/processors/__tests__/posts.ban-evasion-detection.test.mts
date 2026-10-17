import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { isFirstCommunityPost } from '@services/communities/ban-evasion'
import { processPostCreated } from '../posts.mts'
import { MODERATION_SIGNALS_BAN_EVASION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import { moderationSignalsQueue } from '@queues/moderation-signals/queues'

describe('processPostCreated ban-evasion detection', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('enqueues ban-evasion detection when post is the first community post', async () => {
    const member = await createTestUser()
    const random = createRandomString(8)
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    const postId = await insertTestPost({
      title: `Ban evasion detection post ${random}`,
      slug: `ban-evasion-detect-${random}`,
      markdown: 'Content',
      createdById: member.id,
      communityId: community.id,
      postType: 'article',
    })

    expect(await isFirstCommunityPost(community.id, member.id, postId)).toBe(true)

    await processPostCreated({ id: postId })

    const waiting = await readAllQueueJobs(moderationSignalsQueue)
    expect(
      waiting.some(j => {
        if (j.name !== MODERATION_SIGNALS_BAN_EVASION_JOB.name) return false
        const data = j.data as { communityId: string; userId: string; postId?: string }
        return (
          data.communityId === community.id && data.userId === member.id && data.postId === postId
        )
      }),
    ).toBe(true)
  })
})
