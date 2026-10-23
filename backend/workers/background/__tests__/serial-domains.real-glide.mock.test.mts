import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('serial background domains through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('runs every post-publication job name one at a time across workers while story projections run in their own group', async () => {
    const active = { 'post-publication': 0, 'story-post-related-url-projections': 0 }
    const maxActive = { 'post-publication': 0, 'story-post-related-url-projections': 0 }
    const started = { 'post-publication': 0, 'story-post-related-url-projections': 0 }
    const firstStarted = Promise.withResolvers<void>()
    const storyStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const track = (domain: keyof typeof active, onStart: () => void) => async (): Promise<void> => {
      started[domain] += 1
      active[domain] += 1
      maxActive[domain] = Math.max(maxActive[domain], active[domain])
      onStart()
      await release.promise
      active[domain] -= 1
    }
    const publication = track('post-publication', firstStarted.resolve)
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      bodies: {
        [POST_PUBLICATION_RECONCILE_JOB.name]: publication,
        [POST_PUBLICATION_SHADOW_AUDIT_JOB.name]: publication,
        [POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name]: publication,
        [STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name]: track(
          'story-post-related-url-projections',
          storyStarted.resolve,
        ),
      },
    })
    harness.registerBeforeClose(() => release.resolve())
    try {
      const jobs = await Promise.all([
        harness.add(POST_PUBLICATION_RECONCILE_JOB, {}),
        harness.add(POST_PUBLICATION_SHADOW_AUDIT_JOB, { dryRun: true, cursor: null }),
        harness.add(POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB, {
          cursor: null,
          cutoffArchivedAt: null,
        }),
        harness.add(POST_PUBLICATION_RECONCILE_JOB, {}),
      ])
      await firstStarted.promise
      const story = await Promise.all([
        harness.add(STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB, {}),
        harness.add(STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB, {}),
      ])

      // A parked post-publication job leaves the second worker free for the story group.
      await storyStarted.promise
      expect(started['post-publication']).toBe(1)
      expect(started['story-post-related-url-projections']).toBe(1)

      release.resolve()
      await Promise.all([...jobs, ...story].map(job => harness!.settled(job)))
      expect(started).toEqual({ 'post-publication': 4, 'story-post-related-url-projections': 2 })
      expect(maxActive).toEqual({ 'post-publication': 1, 'story-post-related-url-projections': 1 })
    } finally {
      // A failed assertion must not leave a handler holding the worker open.
      release.resolve()
    }
  })
})
