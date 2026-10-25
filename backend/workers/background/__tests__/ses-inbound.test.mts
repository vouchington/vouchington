import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
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
        {
          ...SES_INBOUND_RECONCILE_JOB.options,
          jobId: `ses-inbound-invalid-${crypto.randomUUID()}`,
          attempts: 1,
          removeOnFail: true,
        },
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
          { ...SES_INBOUND_PROCESS_JOB.options, jobId, attempts: 1, removeOnFail: 100 },
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

  it('rejects an unknown job name in the served domain', async () => {
    await expect(
      background.add(
        'ses-inbound.unknown',
        {},
        {
          ...SES_INBOUND_PROCESS_JOB.options,
          attempts: 1,
          removeOnFail: true,
        },
      ),
    ).rejects.toThrow('Unknown background job: ses-inbound.unknown')
  })
})
