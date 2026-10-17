import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { readClassifierRunDispatcherJobsForTest } from '@voucha/test-helpers/classifier-run-queue-jobs'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import { withOwnedPostCommitCompletions } from '@voucha/test-helpers/post-commit-completion'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { background } from '@queues/background/queues'
import { MODERATION_SIGNALS_SPAM_DETECTION_JOB } from '@queues/background/enqueues/moderation-signals-jobs'
import { moderationSignalsQueue } from '@queues/moderation-signals/queues'
import { classifierRunDispatcherJobId } from '../../../queues/ai-agents/enqueues/classifier-run.mts'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import type { PrivateUser } from '@services/users/types'
import { ENTITY_LISTENERS_POST_CREATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import type { ProcessPostCreatedJobData } from '@queues/background/enqueues/entity-listeners-payloads'

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
    // Admin bypass removes moderation/spam work, not the documented autotagging fan-out.
    const taggingData = {
      classifier: TAGGING_CLASSIFIER_SLUG,
      postId: post.id,
      rssFeedItemId: null,
    }
    expect(await getClassifierRunRequestFacts(post.id)).toMatchObject([
      { classifier_slug: TAGGING_CLASSIFIER_SLUG },
    ])
    const dispatcherJobs = await readClassifierRunDispatcherJobsForTest(post.id)
    expect(dispatcherJobs).toHaveLength(1)
    expect(dispatcherJobs[0]).toMatchObject({
      id: classifierRunDispatcherJobId(taggingData),
      name: 'classifier-run-dispatcher',
    })
    expect(dispatcherJobs[0]!.data).toEqual(taggingData)
    expect(
      (await readAllQueueJobs(background)).filter(
        job =>
          job.name === OPENAI_MODERATION_POST_JOB.name &&
          job.data !== null &&
          typeof job.data === 'object' &&
          'id' in job.data &&
          job.data.id === post.id,
      ),
    ).toEqual([])
    expect(
      (await readAllQueueJobs(moderationSignalsQueue)).filter(
        job =>
          job.name === MODERATION_SIGNALS_SPAM_DETECTION_JOB.name &&
          job.data !== null &&
          typeof job.data === 'object' &&
          'id' in job.data &&
          job.data.id === post.id,
      ),
    ).toEqual([])
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
  const slug = `admin-bypass-${crypto.randomUUID()}`
  return withOwnedPostCommitCompletions(
    new Set([slug]),
    () => createPost(actor, WEB_PROVENANCE, { ...input, slug }),
    async (post, completions) => {
      expect(completions).toHaveLength(1)
      expect(completions[0]).toMatchObject({ kind: 'created', postId: post.id, slug })
      // The helper drains the actual producer settlement, including every rejected operation,
      // before returning; the canonical test adapter also completes processPostCreated.
      const settled = await completions[0]!.completion
      expect(settled.operations).toHaveLength(2)
      expect(settled.operations.every(operation => operation.status === 'fulfilled')).toBe(true)
    },
  )
}

async function findPostCreatedJobInNonFailedState(postId: string) {
  const jobs = (
    await Promise.all(NON_FAILED_QUEUE_STATES.map(state => entitiesListeners.getJobs(state)))
  ).flat()
  return jobs.find(
    job =>
      job.name === ENTITY_LISTENERS_POST_CREATED_JOB.name &&
      (job.data as ProcessPostCreatedJobData).id === postId,
  )
}
