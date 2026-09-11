import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { UnrecoverableError } from '@modules/queue-errors'
import {
  insertEmbeddingIfMissing,
  insertTestSupportContact,
  insertTestSupportMessage,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import {
  processCustomerSupportJob,
  type CustomerSupportJobData,
  type CustomerSupportWorker,
} from '../processors/process-job.mts'

describe('customer-support', () => {
  const worker: CustomerSupportWorker = {
    rateLimit: vi.fn<CustomerSupportWorker['rateLimit']>(() => Promise.resolve()),
  }

  it('permanently rejects when threadId is missing', async () => {
    await expect(
      processCustomerSupportJob(
        job('embedSupportMessage', { messageId: 'message-1' } as CustomerSupportJobData),
        worker,
      ),
    ).rejects.toThrow(UnrecoverableError)
  })

  it.each([
    ['missing', undefined],
    ['null', null],
  ])('permanently rejects %s job data', async (_description, data) => {
    await expect(
      processCustomerSupportJob(job('embedSupportMessage', data), worker),
    ).rejects.toThrow(UnrecoverableError)
  })

  it('permanently rejects unknown jobs', async () => {
    await expect(
      processCustomerSupportJob(
        job('missingJob', { threadId: 'thread-1', messageId: 'message-1' }),
        worker,
      ),
    ).rejects.toThrow(UnrecoverableError)
  })

  it('returns null when a valid job references a missing message', async () => {
    await expect(
      processCustomerSupportJob(
        job('embedSupportMessage', { threadId: randomUUID(), messageId: randomUUID() }),
        worker,
      ),
    ).resolves.toBeNull()
  })

  it('embeds an existing message from a local embedding without an external request', async () => {
    const contact = await insertTestSupportContact({
      emailAddress: `tests+customer-support-${randomUUID()}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const bodyText = 'Customer-support processor test message'
    const contentSha256 = createHash('sha256').update(bodyText).digest()
    await insertEmbeddingIfMissing(contentSha256, `[${new Array(1024).fill(0).join(',')}]`)
    const message = await insertTestSupportMessage({ supportThreadId: thread.id, bodyText })

    await expect(
      processCustomerSupportJob(
        job('embedSupportMessage', { threadId: thread.id, messageId: message.id }),
        worker,
      ),
    ).resolves.toEqual({ success: true })
  })
})

function job(name: string, data?: CustomerSupportJobData | null): Job<CustomerSupportJobData> {
  return { name, data } as Job<CustomerSupportJobData>
}
