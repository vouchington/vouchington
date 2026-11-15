import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
  getPostArchivedFields,
} from '@voucha/test-helpers'
import { deleteTestPostReviewRating } from '@voucha/test-helpers/entities/post-review-ratings'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { listReviewSuccessionsForPostIds } from '@voucha/test-helpers/post-review-successions'
import { postsWorkConfig } from '@services/posts/work-limits'
import { reconcileReviewSuccessionsForPostPage } from '@services/posts/review-successions/index'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import { POST_PUBLICATION_EFFECTS_JOB } from '@queues/background/enqueues/post-publication-jobs'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { processApplyPostPublicationEffects } from './direct-effects.mts'

describe('review succession publication continuation', () => {
  it('restores an old group beyond the history page, replays safely, and visits one owned post per run', async () => {
    const author = await createTestUser({ administrator: true })
    const topics: string[] = []
    for (let index = 0; index < 5; index++) {
      topics.push(
        await insertTestTopic({
          name: `Paged succession ${randomUUID()}`,
          slug: `paged-succession-${randomUUID()}`,
          createdById: author.id,
        }),
      )
    }
    const makeReview = async (topicId: string) => {
      const id = await insertTestPost({
        title: 'Paged succession',
        slug: `paged-succession-${randomUUID()}`,
        createdById: author.id,
        markdown: 'Review fixture',
        postType: 'review',
        clearanceStatus: 'approved',
      })
      await insertTestPostReview(id, topicId)
      return id
    }
    const oldA = [
      await makeReview(topics[0]!),
      await makeReview(topics[0]!),
      await makeReview(topics[0]!),
    ]
    const oldB = [await makeReview(topics[1]!), await makeReview(topics[1]!)]
    const successorId = await makeReview(topics[0]!)
    await reconcileReviewSuccessionsForPostPage(successorId)
    await deleteTestPostReviewRating(successorId, topics[0]!)
    await insertTestPostReview(successorId, topics[1]!)
    await reconcileReviewSuccessionsForPostPage(successorId)
    expect((await getPostArchivedFields(oldA[2]!))?.archived_at).toBeNull()
    expect((await getPostArchivedFields(oldB[1]!))?.archived_at).not.toBeNull()
    await deleteTestPostReviewRating(successorId, topics[1]!)
    await insertTestPostReview(successorId, topics[2]!)
    const secondPredecessor = await makeReview(topics[3]!)
    const secondSuccessor = await makeReview(topics[3]!)
    const excludedPredecessor = await makeReview(topics[4]!)
    await makeReview(topics[4]!)
    // Two still-active A predecessors fill the first history page; B must restore later.
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      review_succession_candidate_page_size: 2,
    })
    onTestFinished(restore)
    const data: PostPublicationEffectsJobData = {
      changeId: randomUUID(),
      postId: null,
      scope: { type: 'post', id: successorId },
      reason: 'post_topics_changed',
      keys: [],
      keyHash: hashCapturedPublicationKeys([]),
      chunkIndex: 0,
      scopeStart: false,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
      continuation: {
        kind: 'review_successions',
        subjectIds: [successorId, secondSuccessor],
        subjectIndex: 0,
        after: null,
      },
    }
    const pending: PostPublicationEffectsJobData[] = []
    const ownedJobs = new Set<string>()
    const onAdded = (job: { id: string; name: string; data: unknown }) => {
      const next = job.data as Partial<PostPublicationEffectsJobData>
      if (job.name === POST_PUBLICATION_EFFECTS_JOB.name && next.changeId === data.changeId) {
        pending.push(job.data as PostPublicationEffectsJobData)
        ownedJobs.add(job.id)
      }
    }
    backgroundQueue.on('added', onAdded)
    onTestFinished(async () => {
      backgroundQueue.off('added', onAdded)
      await Promise.all(
        [...ownedJobs].map(async id => (await backgroundQueue.getJob(id))?.remove()),
      )
    })
    const before = await listReviewSuccessionsForPostIds([successorId])
    await processApplyPostPublicationEffects(data)
    expect((await getPostArchivedFields(secondPredecessor))?.archived_at).toBeNull()
    const firstCursor = pending[0]?.continuation?.after
    expect(firstCursor).toBeTruthy()
    expect(pending[0]?.continuation?.subjectIndex).toBe(0)
    await processApplyPostPublicationEffects(data)
    expect(await listReviewSuccessionsForPostIds([successorId])).toEqual(before)
    // Replay may admit the same stable job twice; consume each descriptor once.
    const seen = new Set<string>()
    for (let index = 0; index < pending.length; index++) {
      if (index >= 10) throw new Error('Unexpected succession continuation cycle')
      const next = pending[index]!
      const key = JSON.stringify(next.continuation)
      if (seen.has(key)) continue
      seen.add(key)
      await processApplyPostPublicationEffects(next)
    }
    expect((await getPostArchivedFields(oldB[1]!))?.archived_at).toBeNull()
    expect((await getPostArchivedFields(secondPredecessor))?.archived_at).not.toBeNull()
    expect((await getPostArchivedFields(excludedPredecessor))?.archived_at).toBeNull()
    expect(pending.some(job => job.continuation?.subjectIndex === 1)).toBe(true)
    expect(
      pending.every(
        job => job.continuation?.subjectIds.join(',') === [successorId, secondSuccessor].join(','),
      ),
    ).toBe(true)
  })

  it('rejects an invalid subject index without querying or admitting a continuation', async () => {
    const id = randomUUID()
    const data: PostPublicationEffectsJobData = {
      changeId: randomUUID(),
      postId: null,
      scope: { type: 'post', id },
      reason: 'post_updated',
      keys: [],
      keyHash: hashCapturedPublicationKeys([]),
      chunkIndex: 0,
      scopeStart: false,
      scopeTopicKeysCaptured: false,
      keyOffset: 0,
      continuation: { kind: 'review_successions', subjectIds: [id], subjectIndex: -1, after: null },
    }
    await expect(processApplyPostPublicationEffects(data)).rejects.toThrow(
      'Invalid publication review succession continuation',
    )
  })
})
