import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import type { PrivateUser } from '@services/users/types'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import type { ProcessPostCreatedJobData } from '@queues/entity-listeners/types'

import { createPost } from '../create.mts'

let admin: PrivateUser
let user: PrivateUser
const NON_FAILED_QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed'] as const

describe('create.admin-bypass', () => {
  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
  })

  it('createPost does not request community moderation for admin auto-approved publications', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({ createdById: admin.id })

    const post = await createPost(admin, {
      title: `Admin community post ${suffix}`,
      markdown: 'Admin-created post published to a community',
      post_type: 'discussion',
      community_id: community.id,
    })

    expect(post.clearance_status).toBe('approved')
    await expect.poll(() => findPostCreatedJobInNonFailedState(post.id)).toBeDefined()
    expect(
      await getClassifierRunRequestFacts(post.id, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toEqual([])
    expect(await readClassifierRunDispatcherJobsForTest(post.id)).toEqual([])
  })

  it('createPost still requests community moderation for non-admin auto-approved publications', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id })

    const post = await createPost(user, {
      title: `User community post ${suffix}`,
      markdown: 'Regular user post published to a community',
      post_type: 'discussion',
      community_id: community.id,
    })

    expect(post.clearance_status).toBe('pending')
    await expect.poll(() => findPostCreatedJobInNonFailedState(post.id)).toBeDefined()
    expect(
      await getClassifierRunRequestFacts(post.id, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toMatchObject([{ run_id: null, no_work_at: null, stale_at: null }])
    await expect
      .poll(async () => {
        const jobs = await readClassifierRunDispatcherJobsForTest(post.id)
        return jobs.filter(
          job =>
            (job.data as { classifier?: string }).classifier ===
            COMMUNITY_MODERATION_CLASSIFIER_SLUG,
        ).length
      })
      .toBe(1)
  })
})

async function findPostCreatedJobInNonFailedState(postId: string) {
  const jobs = (
    await Promise.all(NON_FAILED_QUEUE_STATES.map(state => entitiesListeners.getJobs(state)))
  ).flat()
  return jobs.find(
    job =>
      job.name === 'processPostCreated' && (job.data as ProcessPostCreatedJobData).id === postId,
  )
}
