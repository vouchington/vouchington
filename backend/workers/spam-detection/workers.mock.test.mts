import { randomUUID } from 'node:crypto'
import { describe, expect, it, type Mock, vi } from 'vitest'

const workerMock = vi.hoisted(
  () =>
    vi.fn<typeof import('glide-mq').Worker>() as Mock<typeof import('glide-mq').Worker> &
      typeof import('glide-mq').Worker,
)

vi.mock<typeof import('glide-mq')>(import('glide-mq'), () => ({
  Worker: workerMock,
}))

import { handleSpamDetectionJob } from './workers.mts'

describe('handleSpamDetectionJob', () => {
  it('throws when the post id is missing', async () => {
    await expect(handleSpamDetectionJob({ data: { id: '' } } as any)).rejects.toThrow(
      'Spam detection job requires id in job.data',
    )
  })

  it('returns when the processor skips a missing or stale post', async () => {
    const result = await handleSpamDetectionJob({
      data: {
        id: randomUUID(),
        contentSha256: Buffer.alloc(32, 4).toString('hex'),
      },
    } as any)

    expect(result).toEqual({ success: true, applied: false })
  })
})
