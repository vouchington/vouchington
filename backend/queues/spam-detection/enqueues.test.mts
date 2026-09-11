import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { enqueueSpamDetection } from './enqueues.mts'
import { spam_detection } from './queues.mts'

describe('enqueueSpamDetection', () => {
  beforeEach(async () => {
    await spam_detection.obliterate({ force: true })
  })

  it('includes the content hash in the job payload and deduplication id', async () => {
    const postId = randomUUID()
    const contentSha256 = Buffer.alloc(32, 2)
    const contentSha256Hex = contentSha256.toString('hex')

    await enqueueSpamDetection(postId, { contentSha256 })

    const waiting = await spam_detection.getJobs('waiting')
    const job = waiting.find(item => (item.data as { id?: string }).id === postId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ id: postId, contentSha256: contentSha256Hex })
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `spam_detection_${postId}_${contentSha256Hex}`,
        mode: 'debounce',
      },
    })
  })

  it('keeps the legacy post-level deduplication id when no content hash is provided', async () => {
    const postId = randomUUID()

    await enqueueSpamDetection(postId)

    const waiting = await spam_detection.getJobs('waiting')
    const job = waiting.find(item => (item.data as { id?: string }).id === postId)
    expect(job).toBeDefined()
    expect(job!.data).toEqual({ id: postId })
    expect(job!.opts).toMatchObject({
      deduplication: {
        id: `spam_detection_${postId}`,
        mode: 'debounce',
      },
    })
  })

  it('uses the explicit replacement key when provided', async () => {
    const postId = randomUUID()
    const contentSha256 = Buffer.alloc(32, 3)
    const deduplicationKey = `${contentSha256.toString('hex')}_456`

    await enqueueSpamDetection(postId, { contentSha256, deduplicationKey })

    const waiting = await spam_detection.getJobs('waiting')
    const job = waiting.find(item => (item.data as { id?: string }).id === postId)
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      deduplication: {
        id: `spam_detection_${postId}_${deduplicationKey}`,
        mode: 'debounce',
      },
    })
  })
})
