import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createPost } from './create.mts'
import { getPostByAny } from './get.mts'
import { addPostRating, deletePostRating, updatePostRating } from './post-ratings.mts'
import { ENTITY_LISTENERS_POST_UPDATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
import { rssFeedMaintenance } from '@queues/rss-feed-maintenance/queues'
import {
  createTestUser,
  insertTestRssFeedDirect,
  insertTestTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  holdQueueAdmission,
  holdQueueBulkAdmission,
} from '@voucha/test-helpers/queue-admission-hold'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'

const REVIEW_MARKDOWN =
  'This review gives detailed context from repeated personal use, including the strongest benefits, the weakest tradeoffs, and how the product performed over time. It explains why the rating is justified with concrete observations that another consumer could compare against their own needs. I would use these details to make the same decision again.'

describe.each(['entity', 'rss'] as const)('post-rating %s admission', port => {
  it.each(['add', 'update', 'delete'] as const)(
    'waits after the %s rating commits',
    async method => {
      const user = await createTestUser()
      const suffix = randomUUID()
      const [retainedId, targetId] = await Promise.all(
        ['retained', 'target'].map(label =>
          insertTestTopic({
            name: `Rating admission ${label} ${suffix}`,
            slug: `rating-admission-${label}-${suffix}`,
            createdById: user.id,
          }),
        ),
      )
      const initialRatings = [{ topic_id: retainedId!, rating: 5 }]
      if (method !== 'add') initialRatings.push({ topic_id: targetId!, rating: 2 })
      const post = await createPost(user, WEB_PROVENANCE, {
        title: `Rating admission ${suffix}`,
        markdown: REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: initialRatings,
      })
      const feed =
        port === 'rss' ? await insertTestRssFeedDirect({ topicId: targetId! }) : undefined
      const name =
        port === 'entity'
          ? ENTITY_LISTENERS_POST_UPDATED_JOB.name
          : 'processEvaluateRssFeedDiscoverability'
      const queue = port === 'entity' ? entitiesListeners : rssFeedMaintenance
      const gate =
        port === 'entity'
          ? holdQueueAdmission(
              queue,
              name,
              data =>
                typeof data === 'object' && data !== null && 'id' in data && data.id === post.id,
            )
          : holdQueueBulkAdmission(
              queue,
              name,
              data =>
                typeof data === 'object' &&
                data !== null &&
                'rssFeedId' in data &&
                data.rssFeedId === feed?.id,
            )
      const siblingAdmissions: ReturnType<typeof entitiesListeners.add>[] = []
      const originalAdd = entitiesListeners.add
      const siblingSpy =
        port === 'rss'
          ? vi.spyOn(entitiesListeners, 'add').mockImplementation((jobName, data, options) => {
              const admission = originalAdd.call(entitiesListeners, jobName, data, options)
              if (
                jobName === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
                typeof data === 'object' &&
                data !== null &&
                'id' in data &&
                data.id === post.id
              )
                siblingAdmissions.push(admission)
              return admission
            })
          : undefined
      let operation: Promise<void> | undefined
      let settled = false
      let entered = false
      void gate.entered.then(() => {
        entered = true
      })
      let cleanupPromise: Promise<void> | undefined
      const cleanup = () => {
        cleanupPromise ??= (async () => {
          gate.release()
          try {
            await operation?.catch(() => undefined)
            if (entered) await removeEnqueuedJobs([gate.admitted.catch(() => [])], name)
            await removeEnqueuedJobs(
              siblingAdmissions.map(admission => admission.catch(() => [])),
              ENTITY_LISTENERS_POST_UPDATED_JOB.name,
            )
          } finally {
            gate.restore()
            siblingSpy?.mockRestore()
          }
        })()
        return cleanupPromise
      }
      onTestFinished(cleanup)
      operation = (
        method === 'add'
          ? addPostRating(user, post, { topic_id: targetId!, rating: 3, order_index: 1 })
          : method === 'update'
            ? updatePostRating(user, post, targetId!, { rating: 3 })
            : deletePostRating(user, post, targetId!)
      ).finally(() => {
        settled = true
      })

      try {
        expect(
          await Promise.race([
            gate.entered.then(() => 'admission-entered'),
            operation.then(
              () => 'mutation-settled',
              () => 'mutation-rejected',
            ),
          ]),
        ).toBe('admission-entered')
        const committed = await getPostByAny(post.id)
        expect(
          committed?.review_topic_ratings?.map(({ topic_id, rating }) => ({ topic_id, rating })),
        ).toEqual(
          method === 'delete'
            ? [{ topic_id: retainedId, rating: 5 }]
            : [
                { topic_id: retainedId, rating: 5 },
                { topic_id: targetId, rating: 3 },
              ],
        )
        expect(settled).toBe(false)
        expect(siblingAdmissions).toHaveLength(port === 'rss' ? 1 : 0)

        gate.release()
        const admitted = await gate.admitted
        await operation
        const jobs = Array.isArray(admitted) ? admitted : [admitted]
        expect(jobs).toHaveLength(1)
        const receipts = [
          {
            queue,
            admission: Promise.resolve(jobs[0]),
            name,
            data: port === 'entity' ? { id: post.id } : { rssFeedId: feed?.id },
          },
          ...siblingAdmissions.map(admission => ({
            queue: entitiesListeners,
            admission,
            name: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
            data: { id: post.id },
          })),
        ]
        expect(receipts).toHaveLength(port === 'rss' ? 2 : 1)
        for (const receipt of receipts)
          expect(await readEnqueuedJob(receipt.queue, await receipt.admission)).toMatchObject({
            name: receipt.name,
            data: receipt.data,
          })
      } finally {
        await cleanup()
      }
    },
  )
})
