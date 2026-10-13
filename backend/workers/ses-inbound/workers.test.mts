import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import {
  SES_INBOUND_PROCESS_JOB_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
} from '@ts-shared/ses-inbound-contract'
import { readRetainedFailedSesInboundProcessJobs } from '@queues/ses-inbound/enqueues'
import { sesInboundQueue } from '@queues/ses-inbound/queues'
import { sesInboundWorker } from './workers.mts'

describe('SES inbound worker reconciliation payload', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(sesInboundWorker)
  })

  it('passes the queued token to validation before any S3 listing', async () => {
    await expect(
      sesInboundQueue.add(
        SES_INBOUND_RECONCILE_JOB_NAME,
        { continuationToken: '' },
        { jobId: `ses-inbound-invalid-${crypto.randomUUID()}`, attempts: 1, removeOnFail: true },
      ),
    ).rejects.toThrow('SES inbound continuation token must be a non-empty string')
  })

  it('exposes a retained failed process job for reconciliation retry', async () => {
    const jobId = `ses-inbound-failed-${crypto.randomUUID()}`
    try {
      await expect(
        sesInboundQueue.add(
          SES_INBOUND_PROCESS_JOB_NAME,
          { sesMessageId: 'different', objectKey: 'copyright-incoming/message' },
          { jobId, attempts: 1, removeOnFail: 100 },
        ),
      ).rejects.toThrow('SES inbound job message ID must match its S3 object key')
      const failedJobs = await readRetainedFailedSesInboundProcessJobs()
      expect(failedJobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: jobId, name: SES_INBOUND_PROCESS_JOB_NAME }),
        ]),
      )
    } finally {
      await (await sesInboundQueue.getJob(jobId))?.remove()
    }
  })
})
