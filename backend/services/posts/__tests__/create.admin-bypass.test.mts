import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import type { PrivateUser } from '@services/users/types'
import * as entityListenerEnqueues from '@queues/entity-listeners/enqueues'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import type { ProcessPostCreatedJobData } from '@queues/entity-listeners/types'

import { createPost } from '../create.mts'
import type { CreatePostInput } from '../types.mts'

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

    const post = await createPostAndSettleCreatedEnqueue(admin, {
      title: `Admin community post ${suffix}`,
      markdown: 'Admin-created post published to a community',
      post_type: 'discussion',
      community_id: community.id,
    })

    expect(post.clearance_status).toBe('approved')
    expect(await findPostCreatedJobInNonFailedState(post.id)).toBeDefined()
    expect(
      await getClassifierRunRequestFacts(post.id, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toEqual([])
    expect(await readClassifierRunDispatcherJobsForTest(post.id)).toEqual([])
  })

  it('createPost still requests community moderation for non-admin auto-approved publications', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id })

    const post = await createPostAndSettleCreatedEnqueue(user, {
      title: `User community post ${suffix}`,
      markdown: 'Regular user post published to a community',
      post_type: 'discussion',
      community_id: community.id,
    })

    expect(post.clearance_status).toBe('pending')
    expect(await findPostCreatedJobInNonFailedState(post.id)).toBeDefined()
    expect(
      await getClassifierRunRequestFacts(post.id, COMMUNITY_MODERATION_CLASSIFIER_SLUG),
    ).toMatchObject([{ run_id: null, no_work_at: null, stale_at: null }])
    const dispatcherJobs = await readClassifierRunDispatcherJobsForTest(post.id)
    expect(
      dispatcherJobs.filter(
        job =>
          (job.data as { classifier?: string }).classifier === COMMUNITY_MODERATION_CLASSIFIER_SLUG,
      ),
    ).toHaveLength(1)
  })
})

async function createPostAndSettleCreatedEnqueue(actor: PrivateUser, input: CreatePostInput) {
  const enqueue = vi.spyOn(entityListenerEnqueues, 'enqueueOnPostCreated')
  try {
    const post = await createPost(actor, WEB_PROVENANCE, input)
    await Promise.all(enqueue.mock.results.map(result => result.value))
    return post
  } finally {
    enqueue.mockRestore()
  }
}

async function findPostCreatedJobInNonFailedState(postId: string) {
  const jobs = (
    await Promise.all(NON_FAILED_QUEUE_STATES.map(state => entitiesListeners.getJobs(state)))
  ).flat()
  return jobs.find(
    job =>
      job.name === 'processPostCreated' && (job.data as ProcessPostCreatedJobData).id === postId,
  )
}
