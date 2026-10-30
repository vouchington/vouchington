import { describe, expect, it } from 'vitest'
import { ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES } from './durable-delivery-data-contract.mts'
import { createActivityPubInboxDeliveryJob } from './durable-delivery-transition-intake.mts'

const MAX_JOB_DATA_SIZE = 1_048_576

// HTTP's total header allowance is smaller than these per-field values; this tests a
// conservative serialization bound, including JSON escaping and base64 expansion.
describe('ActivityPub inbox job data', () => {
  it('fits the largest accepted raw body and oversized signed headers in one GlideMQ job', () => {
    const header = '\\'.repeat(16 * 1024)
    const job = createActivityPubInboxDeliveryJob({
      requestMethod: 'POST',
      requestTarget: `/ap/inbox?${header}`,
      expectedHost: header,
      signatureHeader: header,
      digestHeader: header,
      dateHeader: header,
      contentTypeHeader: header,
      rawBody: Buffer.alloc(ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES, 0xff),
      senderHostname: 'example.com',
    })
    expect(Buffer.byteLength(JSON.stringify(job), 'utf8')).toBeLessThan(MAX_JOB_DATA_SIZE)
    expect(Buffer.from(job.rawBodyBase64, 'base64')).toHaveLength(
      ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES,
    )
  })
})
