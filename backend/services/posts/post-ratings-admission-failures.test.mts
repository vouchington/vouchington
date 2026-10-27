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
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { readEnqueuedJob, removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'

const REVIEW_MARKDOWN =
  'This review gives detailed context from repeated personal use, including the strongest benefits, the weakest tradeoffs, and how the product performed over time. It explains why the rating is justified with concrete observations that another consumer could compare against their own needs. I would use these details to make the same decision again.'

describe('post-rating admission failures', () => {
  it.each(['add', 'update', 'delete'] as const)(
    'keeps the committed %s rating when entity admission rejects',
    async method => {
      const user = await createTestUser()
      const suffix = randomUUID()
      const [retainedId, targetId] = await Promise.all(
        ['retained', 'target'].map(label =>
          insertTestTopic({
            name: `Rating rejection ${label} ${suffix}`,
            slug: `rating-rejection-${label}-${suffix}`,
            createdById: user.id,
          }),
        ),
      )
      const initialRatings = [{ topic_id: retainedId!, rating: 5 }]
      if (method !== 'add') initialRatings.push({ topic_id: targetId!, rating: 2 })
      const post = await createPost(user, WEB_PROVENANCE, {
        title: `Rating rejection ${suffix}`,
        markdown: REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: initialRatings,
      })
      const admissionError = new Error(`Owned rating entity admission ${suffix}`)
      const originalAdd = entitiesListeners.add
      let matchingAdmissions = 0
      const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
        if (
          name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
          typeof data === 'object' &&
          data !== null &&
          'id' in data &&
          data.id === post.id
        ) {
          matchingAdmissions += 1
          return Promise.reject(admissionError)
        }
        return originalAdd.call(entitiesListeners, name, data, options)
      })
      onTestFinished(() => spy.mockRestore())

      const jobs = await captureAddedPublicationEffectsForScope(post.id, async () => {
        if (method === 'add')
          await addPostRating(user, post, { topic_id: targetId!, rating: 3, order_index: 1 })
        else if (method === 'update') await updatePostRating(user, post, targetId!, { rating: 3 })
        else await deletePostRating(user, post, targetId!)
      })

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
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([reported]) => reported === admissionError),
      ).toHaveLength(1)
      expect(jobs.map(job => job.reason)).toContain('post_ratings_changed')
    },
  )

  it.each(['queue', 'lookup'] as const)(
    'keeps a committed rating when RSS %s fails',
    async source => {
      const user = await createTestUser()
      const suffix = randomUUID()
      const topicId = await insertTestTopic({
        name: `Rating RSS failure ${suffix}`,
        slug: `rating-rss-failure-${suffix}`,
        createdById: user.id,
      })
      const post = await createPost(user, WEB_PROVENANCE, {
        title: `Rating RSS failure ${suffix}`,
        markdown: REVIEW_MARKDOWN,
        post_type: 'review',
        review_topic_ratings: [{ topic_id: topicId, rating: 5 }],
      })
      const feed = source === 'queue' ? await insertTestRssFeedDirect({ topicId }) : undefined
      const siblingAdmissions: ReturnType<typeof entitiesListeners.add>[] = []
      const originalAdd = entitiesListeners.add
      const siblingSpy = vi
        .spyOn(entitiesListeners, 'add')
        .mockImplementation((name, data, options) => {
          const admission = originalAdd.call(entitiesListeners, name, data, options)
          if (
            name === ENTITY_LISTENERS_POST_UPDATED_JOB.name &&
            typeof data === 'object' &&
            data !== null &&
            'id' in data &&
            data.id === post.id
          )
            siblingAdmissions.push(admission)
          return admission
        })
      onTestFinished(async () => {
        try {
          await removeEnqueuedJobs(
            siblingAdmissions.map(admission => admission.catch(() => [])),
            ENTITY_LISTENERS_POST_UPDATED_JOB.name,
          )
        } finally {
          siblingSpy.mockRestore()
        }
      })
      const admissionError = new Error(`Owned rating RSS admission ${suffix}`)
      const originalAddBulk = rssFeedMaintenance.addBulk
      let matchingAdmissions = 0
      const spy = vi.spyOn(rssFeedMaintenance, 'addBulk').mockImplementation(jobs => {
        if (
          source === 'queue' &&
          jobs.some(
            job =>
              job.name === 'processEvaluateRssFeedDiscoverability' &&
              typeof job.data === 'object' &&
              job.data !== null &&
              'rssFeedId' in job.data &&
              job.data.rssFeedId === feed?.id,
          )
        ) {
          matchingAdmissions += 1
          return Promise.reject(admissionError)
        }
        return originalAddBulk.call(rssFeedMaintenance, jobs)
      })
      onTestFinished(() => spy.mockRestore())

      let lookupError: Error | undefined
      const jobs = await captureAddedPublicationEffectsForScope(post.id, async () => {
        if (source === 'lookup') {
          const { error } = await withPostgresPoolQueryFailureForTest(
            '/* searchRssFeedIdsByTopicIds */',
            () => updatePostRating(user, post, topicId, { rating: 3 }),
            { command: 'SELECT' },
          )
          lookupError = error
        } else {
          await updatePostRating(user, post, topicId, { rating: 3 })
        }
      })
      expect(lookupError && 'code' in lookupError ? lookupError.code : undefined).toBe(
        source === 'lookup' ? '25P02' : undefined,
      )
      expect(matchingAdmissions).toBe(source === 'queue' ? 1 : 0)
      expect(
        sentryCaptureExceptionMock.mock.calls.filter(([reported]) =>
          source === 'lookup'
            ? reported instanceof Error && reported.cause === lookupError
            : reported === admissionError,
        ),
      ).toHaveLength(1)
      expect((await getPostByAny(post.id))?.review_topic_ratings).toMatchObject([
        { topic_id: topicId, rating: 3 },
      ])
      expect(siblingAdmissions).toHaveLength(1)
      expect(await readEnqueuedJob(entitiesListeners, await siblingAdmissions[0])).toMatchObject({
        name: ENTITY_LISTENERS_POST_UPDATED_JOB.name,
        data: { id: post.id },
      })
      expect(jobs.map(job => job.reason)).toContain('post_ratings_changed')
    },
  )
})
