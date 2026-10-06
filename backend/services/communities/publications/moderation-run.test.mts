import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  beginTransaction,
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers/entities/community-post-reviews'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import type { Community } from '../types.mts'
import { createCommunityPostReview } from './add.mts'
import { approvePublication, rejectPublication } from './moderate.mts'
import { requestCommunityModerationRun } from './moderation-run.mts'
import { overridePublication } from './platform-override.mts'

const requestsOf = (postId: string) =>
  getClassifierRunRequestFacts(postId, COMMUNITY_MODERATION_CLASSIFIER_SLUG)

async function communityDispatchers(postId: string) {
  const jobs = await readClassifierRunDispatcherJobsForTest(postId)
  return jobs.filter(
    job =>
      (job.data as { classifier?: string }).classifier === COMMUNITY_MODERATION_CLASSIFIER_SLUG,
  )
}

describe('community moderation requests are written with the publication change', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let administrator: PrivateUser
  let siteModerator: PrivateUser
  let community: Community
  let approvalCommunity: Community

  async function insertPost(communityId: string, createdById: string, title?: string) {
    const value = createRandomString(8)
    return insertTestPost({
      title: title ?? `Request site ${value}`,
      slug: `request-site-${value}`,
      markdown: 'Post under community rules',
      createdById,
      communityId,
    })
  }

  async function insertPendingPost() {
    const postId = await insertPost(approvalCommunity.id, member.id)
    await insertTestPendingCommunityPostReview({
      communityId: approvalCommunity.id,
      postId,
      submittedById: member.id,
    })
    return postId
  }

  async function insertPublishedPost() {
    const postId = await insertPost(community.id, member.id)
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: member.id,
    })
    return postId
  }

  beforeAll(async () => {
    ;[owner, member, administrator, siteModerator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    ;[community, approvalCommunity] = await Promise.all([
      insertTestCommunity({ createdById: owner.id }),
      insertTestCommunity({ createdById: owner.id, post_approval_required_at: new Date() }),
    ])
    await Promise.all(
      [community, approvalCommunity].flatMap(item => [
        insertTestCommunityMember({ communityId: item.id, userId: owner.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: item.id, userId: member.id, role: 'member' }),
        insertTestCommunityMember({ communityId: item.id, userId: administrator.id }),
      ]),
    )
  })

  describe('requestCommunityModerationRun', () => {
    it('writes nothing, and queues nothing, when the owning transaction rolls back', async () => {
      const postId = await insertPublishedPost()
      {
        await using query = await beginTransaction()
        await expect(requestCommunityModerationRun(query, postId)).resolves.toBe(true)
        await query.rollback()
      }

      expect(await requestsOf(postId)).toEqual([])
      expect(await communityDispatchers(postId)).toEqual([])
    })

    it('requests nothing for a post that is not published in a community', async () => {
      const postId = await insertPendingPost()
      await using query = await beginTransaction()

      await expect(requestCommunityModerationRun(query, postId)).resolves.toBe(false)
      await query.commit()

      expect(await requestsOf(postId)).toEqual([])
    })

    it('queues the dispatcher only after the owning transaction commits', async () => {
      const postId = await insertPendingPost()
      await approvePublication(owner, approvalCommunity.id, postId)

      expect(await requestsOf(postId)).toMatchObject([{ run_id: null, stale_at: null }])
      expect(await communityDispatchers(postId)).toHaveLength(1)
    })
  })

  describe('approvePublication', () => {
    it('requests the run in the approving transaction for a moderator approval', async () => {
      const postId = await insertPendingPost()
      expect(await requestsOf(postId)).toEqual([])

      await approvePublication(owner, approvalCommunity.id, postId)

      expect(await requestsOf(postId)).toHaveLength(1)
      expect(await communityDispatchers(postId)).toHaveLength(1)
    })

    it('requests the run once however often the approval is replayed', async () => {
      const postId = await insertPendingPost()
      await approvePublication(owner, approvalCommunity.id, postId)

      await expect(approvePublication(owner, approvalCommunity.id, postId)).rejects.toMatchObject({
        status: 422,
      })

      expect(await requestsOf(postId)).toHaveLength(1)
    })

    it('requests the run for a platform moderator approval, which is a platform override', async () => {
      const postId = await insertPendingPost()

      await approvePublication(siteModerator, approvalCommunity.id, postId)

      expect(await requestsOf(postId)).toHaveLength(1)
      expect(await communityDispatchers(postId)).toHaveLength(1)
    })

    it('requests nothing when the post is rejected', async () => {
      const postId = await insertPendingPost()

      await rejectPublication(owner, approvalCommunity.id, postId, 'Off topic')

      expect(await requestsOf(postId)).toEqual([])
      expect(await communityDispatchers(postId)).toEqual([])
    })
  })

  describe('overridePublication', () => {
    it('requests the run when staff approve or restore, and not when they reject', async () => {
      const approved = await insertPendingPost()
      const rejected = await insertPendingPost()

      await overridePublication(siteModerator, approvalCommunity.id, approved, {
        action: 'approve',
        reasonCode: 'staff_approved',
      })
      await overridePublication(siteModerator, approvalCommunity.id, rejected, {
        action: 'reject',
        reasonCode: 'staff_rejected',
      })

      expect(await requestsOf(approved)).toHaveLength(1)
      expect(await requestsOf(rejected)).toEqual([])
    })
  })

  describe('createCommunityPostReview', () => {
    it('requests the run for a post published straight into the community', async () => {
      const postId = await insertPost(community.id, member.id)

      await createCommunityPostReview(member.id, postId, community.id)

      expect(await requestsOf(postId)).toHaveLength(1)
      expect(await communityDispatchers(postId)).toHaveLength(1)
    })

    it('requests nothing for a post that waits for moderator approval', async () => {
      const postId = await insertPost(approvalCommunity.id, member.id)

      await createCommunityPostReview(member.id, postId, approvalCommunity.id)

      expect(await requestsOf(postId)).toEqual([])
      expect(await communityDispatchers(postId)).toEqual([])
    })

    it('requests nothing for an administrator, who bypasses community moderation', async () => {
      const postId = await insertPost(community.id, administrator.id)

      await createCommunityPostReview(administrator.id, postId, community.id)

      expect(await requestsOf(postId)).toEqual([])
      expect(await communityDispatchers(postId)).toEqual([])
    })

    it('requests the run in the transaction of the caller and queues it after that commits', async () => {
      const postId = await insertPost(community.id, member.id)
      await using query = await beginTransaction()

      await createCommunityPostReview(member.id, postId, community.id, { query })
      expect(await requestsOf(postId)).toEqual([])
      await query.commit()

      expect(await requestsOf(postId)).toHaveLength(1)
      expect(await communityDispatchers(postId)).toHaveLength(1)
    })
  })
})
