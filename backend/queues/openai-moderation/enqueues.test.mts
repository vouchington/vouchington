import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueBackfillImageModerationContinuation,
  enqueueCreateImageModeration,
  enqueueCreatePostModeration,
  enqueueReconcileImageQuarantines,
  enqueueReconcilePostModeration,
  enqueueReconcilePostModerationContinuation,
} from './enqueues.mts'
import {
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_IMAGE_JOB,
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import { openAiModerationQueue } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'

describe('enqueueCreatePostModeration', () => {
  beforeEach(async () => {
    await openAiModerationQueue.obliterate({ force: true })
  })

  it('enqueues one attempt with the replacement key in the moderation deduplication id', async () => {
    const postId = randomUUID()
    const deduplicationKey = `${'a'.repeat(64)}_123`

    await enqueueCreatePostModeration(postId, { deduplicationKey })

    const waiting = await readAllQueueJobs(openAiModerationQueue)
    const job = waiting.find(
      item =>
        item.name === OPENAI_MODERATION_POST_JOB.name &&
        (item.data as { id?: string }).id === postId,
    )
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      attempts: 1,
      priority: 10,
      ordering: {
        key: 'openai-moderation',
        concurrency: 5,
        rateLimit: { max: 10, duration: 1000 },
      },
      deduplication: {
        id: `post_moderation_${postId}_${deduplicationKey}`,
        mode: 'debounce',
      },
    })
  })
})

describe('image moderation enqueues', () => {
  it('debounces an image moderation job at the task priority unless one is given', async () => {
    const imageId = randomUUID()
    const defaulted = await readEnqueuedJob(
      openAiModerationQueue,
      await enqueueCreateImageModeration(imageId),
    )
    try {
      expect(defaulted).toMatchObject({
        name: OPENAI_MODERATION_IMAGE_JOB.name,
        data: { id: imageId },
        opts: {
          priority: 10,
          deduplication: { id: `image_moderation_${imageId}`, mode: 'debounce' },
        },
      })
      const urgentId = randomUUID()
      const urgent = await readEnqueuedJob(
        openAiModerationQueue,
        await enqueueCreateImageModeration(urgentId, 3),
      )
      try {
        expect(urgent.opts).toMatchObject({ priority: 3 })
      } finally {
        await urgent.remove()
      }
    } finally {
      await defaulted.remove()
    }
  })

  it('keys an image backfill continuation by its cursor so it is not enqueued twice', async () => {
    const afterId = randomUUID()
    const jobId = `backfill_openai_moderation_images__${afterId}`
    const continuation = await readEnqueuedJob(
      openAiModerationQueue,
      await enqueueBackfillImageModerationContinuation(afterId),
    )
    try {
      expect(continuation).toMatchObject({
        id: jobId,
        name: OPENAI_MODERATION_BACKFILL_IMAGES_JOB.name,
        data: { afterId },
      })
    } finally {
      await continuation.remove()
    }
  })
})

describe('enqueueReconcileImageQuarantines', () => {
  beforeEach(async () => {
    await openAiModerationQueue.obliterate({ force: true })
  })

  it('uses a one-attempt, throttled reconciliation job', async () => {
    await enqueueReconcileImageQuarantines()

    const [job] = await readAllQueueJobs(openAiModerationQueue)
    expect(job).toMatchObject({
      name: OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB.name,
      opts: {
        attempts: 1,
        priority: 100,
        deduplication: {
          id: 'openai-moderation:reconcile-image-quarantines',
          mode: 'throttle',
        },
      },
    })
  })
})

describe('enqueueReconcilePostModeration', () => {
  beforeEach(async () => {
    await openAiModerationQueue.obliterate({ force: true })
  })

  it('uses a one-attempt, throttled reconciliation job', async () => {
    await enqueueReconcilePostModeration()

    const [job] = await readAllQueueJobs(openAiModerationQueue)
    expect(job).toMatchObject({
      name: OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB.name,
      opts: {
        attempts: 1,
        priority: 100,
        deduplication: {
          id: 'openai-moderation:reconcile-post-moderation',
          mode: 'throttle',
        },
      },
    })
  })

  it('keys a scoped continuation by its cursor and scope', async () => {
    const cursor = {
      throughId: randomUUID(),
      afterVersionId: randomUUID(),
      afterSource: 'openai_omni' as const,
    }
    const postIds = [randomUUID()]
    const continuation = await readEnqueuedJob(
      openAiModerationQueue,
      await enqueueReconcilePostModerationContinuation(cursor, postIds),
    )
    try {
      expect(continuation).toMatchObject({
        name: OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB.name,
        data: { cursor, postIds },
        opts: { removeOnComplete: true, removeOnFail: true },
      })
      expect(continuation.id).toMatch(
        new RegExp(
          `^post_moderation_reconciliation__${cursor.throughId}__${cursor.afterVersionId}__${cursor.afterSource}__[a-f0-9]{64}$`,
        ),
      )
    } finally {
      await continuation.remove()
    }
  })
})
