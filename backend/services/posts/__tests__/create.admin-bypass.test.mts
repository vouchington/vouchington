import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import type { ProcessPostCreatedJobData } from '@queues/entity-listeners/types'
import { ai_agents } from '@queues/ai-agents/queues'
import type { CommunityModerationDispatcherJobData } from '@queues/ai-agents/types'

import { createPost } from '../create.mts'

let admin: PrivateUser
let user: PrivateUser
const NON_FAILED_QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed'] as const
const ALL_QUEUE_STATES = [...NON_FAILED_QUEUE_STATES, 'failed'] as const
const QUEUE_OBSERVATION_MS = 500
const QUEUE_POLL_INTERVAL_MS = 25
type QueueState = (typeof ALL_QUEUE_STATES)[number]

describe('create.admin-bypass', () => {
  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
  })

  it('createPost does not enqueue community moderation for admin auto-approved publications', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({ createdById: admin.id })

    const post = await createPost(WEB_PROVENANCE, admin, {
      title: `Admin community post ${suffix}`,
      markdown: 'Admin-created post published to a community',
      post_type: 'discussion',
      community_id: community.id,
    })

    expect(post.clearance_status).toBe('approved')
    await expect.poll(() => findPostCreatedJobInNonFailedState(post.id)).toBeDefined()
    await expectNoCommunityModerationDispatcherJobInAnyState(post.id, community.id)
  })

  it('createPost still enqueues community moderation for non-admin auto-approved publications', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id })

    const post = await createPost(WEB_PROVENANCE, user, {
      title: `User community post ${suffix}`,
      markdown: 'Regular user post published to a community',
      post_type: 'discussion',
      community_id: community.id,
    })

    expect(post.clearance_status).toBe('pending')
    await expect.poll(() => findPostCreatedJobInNonFailedState(post.id)).toBeDefined()
    await expect
      .poll(() => findCommunityModerationDispatcherJobInNonFailedState(post.id, community.id))
      .toMatchObject({
        name: 'community-moderation-dispatcher',
        data: { postId: post.id, communityId: community.id },
      })
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

async function findCommunityModerationDispatcherJobInNonFailedState(
  postId: string,
  communityId: string,
) {
  return findCommunityModerationDispatcherJob(postId, communityId, NON_FAILED_QUEUE_STATES)
}

async function findCommunityModerationDispatcherJobInAnyState(postId: string, communityId: string) {
  return findCommunityModerationDispatcherJob(postId, communityId, ALL_QUEUE_STATES)
}

async function expectNoCommunityModerationDispatcherJobInAnyState(
  postId: string,
  communityId: string,
) {
  const observedUntil = Date.now() + QUEUE_OBSERVATION_MS
  await expect
    .poll(
      async () => {
        const job = await findCommunityModerationDispatcherJobInAnyState(postId, communityId)
        if (job) return 'enqueued'
        return Date.now() >= observedUntil ? 'absent' : 'observing'
      },
      { interval: QUEUE_POLL_INTERVAL_MS, timeout: QUEUE_OBSERVATION_MS + 500 },
    )
    .toBe('absent')
}

async function findCommunityModerationDispatcherJob(
  postId: string,
  communityId: string,
  states: readonly QueueState[],
) {
  const jobs = (await Promise.all(states.map(state => ai_agents.getJobs(state)))).flat()
  return jobs.find(job => {
    const data = job.data as CommunityModerationDispatcherJobData
    return (
      job.name === 'community-moderation-dispatcher' &&
      data.postId === postId &&
      data.communityId === communityId
    )
  })
}
