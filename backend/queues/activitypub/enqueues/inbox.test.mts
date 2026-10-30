import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import {
  createActivityPubInboxDeliveryJobId,
  enqueueActivityPubInboxDelivery,
  getActivityPubInboxDeliveryTtlMs,
} from './inbox.mts'
import { ACTIVITYPUB_INBOX_JOB_POLICY } from '@queues/background/enqueues/activitypub-jobs'
import { backgroundQueue as activitypub } from '@voucha/test-helpers/shared-background-queue'
import { ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES } from '../../../services/ap-inbox-activities/durable-delivery-data-contract.mts'

const makeDelivery = () => ({
  requestMethod: 'POST',
  requestTarget: '/ap/inbox',
  expectedHost: 'inbox.example',
  signatureHeader: 'signed',
  digestHeader: 'digest',
  dateHeader: new Date().toUTCString(),
  rawBodyBase64: Buffer.from('{}').toString('base64'),
  senderHostname: 'remote.example',
  requestDigest: randomUUID().replaceAll('-', ''),
  receivedAt: new Date().toISOString(),
})

describe('ActivityPub inbox enqueue', () => {
  it('budgets both actor fetch phases across retries and the final attempt', () => {
    const baseline = getActivityPubInboxDeliveryTtlMs(60_000, 5_000, 10_000)
    const attemptsWithMargin = ACTIVITYPUB_INBOX_JOB_POLICY.attempts + 1
    expect(getActivityPubInboxDeliveryTtlMs(60_000, 5_001, 10_000) - baseline).toBe(
      attemptsWithMargin,
    )
    expect(getActivityPubInboxDeliveryTtlMs(60_000, 5_000, 10_001) - baseline).toBe(
      attemptsWithMargin * 2,
    )
  })

  it('keeps the exact envelope in a sensitive, deduplicated job', async () => {
    const data = makeDelivery()
    const jobId = createActivityPubInboxDeliveryJobId(data.requestDigest)
    const duplicateId = createActivityPubInboxDeliveryJobId(data.requestDigest)
    await enqueueActivityPubInboxDelivery(data, jobId)
    expect(await enqueueActivityPubInboxDelivery(data, duplicateId)).toBeNull()
    expect(duplicateId).not.toBe(jobId)
    const jobs = await readAllQueueJobs(activitypub)
    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      name: 'activitypub.processDelivery',
      data,
      opts: {
        ordering: { key: 'activitypub:inbound', concurrency: 4 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
  })

  it('admits the maximum body plus conservatively large headers through GlideMQ', async () => {
    const header = '\\'.repeat(16 * 1024)
    const data = {
      ...makeDelivery(),
      requestTarget: `/ap/inbox?${header}`,
      expectedHost: header,
      signatureHeader: header,
      digestHeader: header,
      dateHeader: header,
      contentTypeHeader: header,
      rawBodyBase64: Buffer.alloc(ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES, 0xff).toString('base64'),
    }
    const jobId = createActivityPubInboxDeliveryJobId(data.requestDigest)
    await enqueueActivityPubInboxDelivery(data, jobId)
    const job = await activitypub.getJob(jobId)
    expect(job?.data).toMatchObject(data)
    await job?.remove()
  })
})
