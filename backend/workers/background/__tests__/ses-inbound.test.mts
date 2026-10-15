import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { background } from '@queues/background/queues'
import { readRetainedFailedSesInboundProcessJobs } from '@queues/ses-inbound/enqueues'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const worker = createBackgroundWorker({ handlers: BACKGROUND_HANDLERS, domains: ['ses-inbound'] })

describe('SES inbound background handlers', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('passes the queued token to validation before any S3 listing', async () => {
    await expect(
      background.add(
        SES_INBOUND_RECONCILE_JOB.name,
        { continuationToken: '' },
        { jobId: `ses-inbound-invalid-${crypto.randomUUID()}`, attempts: 1, removeOnFail: true },
      ),
    ).rejects.toThrow('SES inbound continuation token must be a non-empty string')
  })

  it('exposes a retained failed process job for reconciliation retry', async () => {
    const jobId = `ses-inbound-failed-${crypto.randomUUID()}`
    try {
      await expect(
        background.add(
          SES_INBOUND_PROCESS_JOB.name,
          { sesMessageId: 'different', objectKey: 'copyright-incoming/message' },
          { jobId, attempts: 1, removeOnFail: 100 },
        ),
      ).rejects.toThrow('SES inbound job message ID must match its S3 object key')
      const failedJobs = await readRetainedFailedSesInboundProcessJobs()
      expect(failedJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: jobId, name: SES_INBOUND_PROCESS_JOB.name }),
        ]),
      )
    } finally {
      await (await background.getJob(jobId))?.remove()
    }
  })

  it('parks a registered job of a domain this worker does not serve and rejects an unknown name', async () => {
    const job = await background.add(
      OPENAI_MODERATION_POST_JOB.name,
      { id: crypto.randomUUID() },
      { attempts: 1 },
    )
    try {
      expect(await job?.getState()).toBe('delayed')
      await expect(
        background.add('not-a-domain.job', {}, { attempts: 1, removeOnFail: true }),
      ).rejects.toThrow('Unknown background job: not-a-domain.job')
    } finally {
      await job?.remove()
    }
  })
})
