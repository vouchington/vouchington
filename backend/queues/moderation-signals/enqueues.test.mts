import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MODERATION_SIGNALS_BAN_EVASION_JOB,
  MODERATION_SIGNALS_SPAM_DETECTION_JOB,
} from '@queues/background/enqueues/moderation-signals-jobs'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueSpamDetection } from './enqueues.mts'
import { moderationSignalsQueue } from './queues.mts'

describe('enqueueSpamDetection', () => {
  it('includes the content hash in the job payload and deduplication id', async () => {
    const postId = randomUUID()
    const contentSha256 = Buffer.alloc(32, 2)
    const contentSha256Hex = contentSha256.toString('hex')

    await enqueueSpamDetection(postId, { contentSha256 })

    const waiting = await readAllQueueJobs(moderationSignalsQueue)
    const job = waiting.find(item => (item.data as { id?: string }).id === postId)
    expect(job).toBeDefined()
    expect(job!.name).toBe(MODERATION_SIGNALS_SPAM_DETECTION_JOB.name)
    expect(job!.data).toEqual({ id: postId, contentSha256: contentSha256Hex })
    expect(job!.opts).toMatchObject({
      priority: 10,
      attempts: 1,
      deduplication: {
        id: `spam_detection_${postId}_${contentSha256Hex}`,
        mode: 'debounce',
      },
    })
    expect(job!.opts.ordering).toBeUndefined()
  })

  it('keeps the legacy post-level deduplication id when no content hash is provided', async () => {
    const postId = randomUUID()

    await enqueueSpamDetection(postId)

    const waiting = await readAllQueueJobs(moderationSignalsQueue)
    const job = waiting.find(item => (item.data as { id?: string }).id === postId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ id: postId })
    expect(job!.opts).toMatchObject({
      deduplication: { id: `spam_detection_${postId}`, mode: 'debounce' },
    })
  })

  it('uses the explicit replacement key when provided', async () => {
    const postId = randomUUID()
    const contentSha256 = Buffer.alloc(32, 3)
    const deduplicationKey = `${contentSha256.toString('hex')}_456`

    await enqueueSpamDetection(postId, { contentSha256, deduplicationKey })

    const waiting = await readAllQueueJobs(moderationSignalsQueue)
    const job = waiting.find(item => (item.data as { id?: string }).id === postId)
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      deduplication: { id: `spam_detection_${postId}_${deduplicationKey}`, mode: 'debounce' },
    })
  })

  it('keeps a spam-detection and a ban-evasion job apart under their own names', () => {
    expect(MODERATION_SIGNALS_SPAM_DETECTION_JOB.name).not.toBe(
      MODERATION_SIGNALS_BAN_EVASION_JOB.name,
    )
  })
})
