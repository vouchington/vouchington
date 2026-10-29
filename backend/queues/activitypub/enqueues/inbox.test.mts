import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueActivityPubInboxDelivery } from './inbox.mts'
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
  it('keeps the exact envelope in a sensitive, deduplicated job', async () => {
    const data = makeDelivery()
    const jobId = `activitypub-inbox__${data.requestDigest}`
    await enqueueActivityPubInboxDelivery(data)
    expect(await enqueueActivityPubInboxDelivery(data)).toBeNull()
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
    await enqueueActivityPubInboxDelivery(data)
    const job = await activitypub.getJob(`activitypub-inbox__${data.requestDigest}`)
    expect(job?.data).toMatchObject(data)
    await job?.remove()
  })
})
