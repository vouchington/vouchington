import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Queue } from 'glide-mq'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../data-stores/valkey-core/glide-mq-client.mts'
import { JobPayloadError } from '@queues/emails/payload/job-payload'
import { QUEUE_NAME } from '@queues/emails/config'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { emails } from './workers.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('emails worker router', () => {
  const queue = new Queue(QUEUE_NAME, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
  })

  afterAll(async () => {
    try {
      await emails.close(true)
    } finally {
      try {
        await queue.obliterate({ force: true })
      } finally {
        await queue.close()
      }
    }
  })

  async function runJob(name: string, data: unknown): Promise<unknown> {
    const jobId = randomUUID()
    const settled = Promise.withResolvers<unknown>()
    const completed = (job: { id: string }, result: unknown) => {
      if (job.id === jobId) settled.resolve(result)
    }
    const failed = (job: { id: string } | undefined, error: Error) => {
      if (job?.id === jobId) settled.reject(error)
    }
    emails.on('completed', completed)
    emails.on('failed', failed)
    try {
      const [, result] = await Promise.all([
        queue.add(name, data, { jobId, attempts: 1 }),
        waitForRealGlideEvent(settled.promise, `email job ${jobId}`),
      ])
      return result
    } finally {
      emails.off('completed', completed)
      emails.off('failed', failed)
    }
  }

  it('rejects a job that left the queue for the email-digests domain', async () => {
    await expect(runJob('dispatchEngagementEmails', {})).rejects.toBeInstanceOf(JobPayloadError)
    await expect(runJob('processSendApiKeyExpiryReminder', {})).rejects.toBeInstanceOf(
      JobPayloadError,
    )
  })

  it('rejects login variables for the welcome template', async () => {
    await expect(
      runJob('processSendWelcomeEmail', {
        input: { userId: '00000000-0000-7000-8000-000000000001' },
        variables: { token: 'secret', expiration: '1 hour' },
      }),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('rejects a copyright payload without a delivery intent identifier', async () => {
    await expect(runJob('processSendCopyrightNoticeEmail', {})).rejects.toBeInstanceOf(
      JobPayloadError,
    )
  })

  it('routes copyright notice email jobs to the copyright processor', async () => {
    await expect(
      runJob('processSendCopyrightNoticeEmail', {
        intentId: '00000000-0000-7000-8000-000000000042',
      }),
    ).resolves.toBe(false)
  })
})
