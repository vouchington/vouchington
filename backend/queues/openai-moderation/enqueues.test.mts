import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueCreatePostModeration,
  enqueueReconcileImageQuarantines,
  enqueueReconcilePostModeration,
} from './enqueues.mts'
import {
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import { openAiModerationQueue } from './queues.mts'
import { readAllQueueJobs } from '@voucha/test-helpers'

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
        concurrency: 50,
        rateLimit: { max: 10, duration: 1000 },
      },
      deduplication: {
        id: `post_moderation_${postId}_${deduplicationKey}`,
        mode: 'debounce',
      },
    })
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
})
