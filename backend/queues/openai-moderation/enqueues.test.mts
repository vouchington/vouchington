import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueCreatePostModeration,
  enqueueReconcileImageQuarantines,
  enqueueReconcilePostModeration,
} from './enqueues.mts'
import { openai_moderation_omni_single } from './queues.mts'

describe('enqueueCreatePostModeration', () => {
  beforeEach(async () => {
    await openai_moderation_omni_single.obliterate({ force: true })
  })

  it('includes the replacement key in the post moderation deduplication id', async () => {
    const postId = randomUUID()
    const deduplicationKey = `${'a'.repeat(64)}_123`

    await enqueueCreatePostModeration(postId, { deduplicationKey })

    const waiting = await openai_moderation_omni_single.getJobs('waiting')
    const job = waiting.find(
      item => item.name === 'post' && (item.data as { id?: string }).id === postId,
    )
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `post_moderation_${postId}_${deduplicationKey}`,
        mode: 'debounce',
      },
    })
  })
})

describe('enqueueReconcileImageQuarantines', () => {
  beforeEach(async () => {
    await openai_moderation_omni_single.obliterate({ force: true })
  })

  it('uses a one-attempt, throttled reconciliation job', async () => {
    await enqueueReconcileImageQuarantines()

    const [job] = await openai_moderation_omni_single.getJobs('waiting')
    expect(job).toMatchObject({
      name: 'reconcile_image_quarantines',
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
    await openai_moderation_omni_single.obliterate({ force: true })
  })

  it('uses a one-attempt, throttled reconciliation job', async () => {
    await enqueueReconcilePostModeration()

    const [job] = await openai_moderation_omni_single.getJobs('waiting')
    expect(job).toMatchObject({
      name: 'reconcile_post_moderation',
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
