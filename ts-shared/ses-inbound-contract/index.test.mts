import { describe, expect, it } from 'vitest'
import {
  assertSesInboundProcessJobData,
  createSesInboundProcessJobId,
  decodeS3EventObjectKey,
  getSesInboundProcessJobOptions,
  getSesMessageIdFromObjectKey,
  SES_INBOUND_FAILED_PREFIX,
  SES_INBOUND_INCOMING_PREFIX,
  SES_INBOUND_PROCESS_JOB_NAME,
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
} from './index.mts'

describe('SES inbound contract', () => {
  it('exposes the stable queue and job names', () => {
    expect(SES_INBOUND_QUEUE_NAME).toBe('ses_inbound')
    expect(SES_INBOUND_PROCESS_JOB_NAME).toBe('processInboundEmail')
    expect(SES_INBOUND_RECONCILE_JOB_NAME).toBe('reconcileInboundEmail')
    expect(SES_INBOUND_INCOMING_PREFIX).toBe('incoming/')
    expect(SES_INBOUND_FAILED_PREFIX).toBe('failed/')
  })

  it('decodes S3 event keys and derives the SES message ID', () => {
    const objectKey = decodeS3EventObjectKey('incoming%2Fabc-123_456.test')

    expect(objectKey).toBe('incoming/abc-123_456.test')
    expect(getSesMessageIdFromObjectKey(objectKey)).toBe('abc-123_456.test')
  })

  it('rejects malformed or unexpected S3 object keys', () => {
    expect(() => decodeS3EventObjectKey('incoming%2Finvalid%ZZ')).toThrow('not valid URL encoding')
    expect(() => getSesMessageIdFromObjectKey('failed/abc123')).toThrow('must start with incoming/')
    expect(() => getSesMessageIdFromObjectKey('incoming/folder/abc123')).toThrow(
      'exactly one SES message ID',
    )
    expect(getSesMessageIdFromObjectKey('incoming/abc+123=opaque')).toBe('abc+123=opaque')
  })

  it('creates deterministic process job IDs and options', () => {
    const objectKey = 'incoming/abc123'
    const jobId = createSesInboundProcessJobId(objectKey)

    expect(jobId).toBe(
      'ses-inbound-process-4d1796ea2007ffe7891150d2b48d06548c1bc39b318bea033173cfe95f856cc0',
    )
    expect(getSesInboundProcessJobOptions({ sesMessageId: 'abc123', objectKey })).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 10,
      jobId,
      deduplication: { id: jobId, mode: 'simple' },
    })
  })

  it('rejects a message ID that does not match the object key', () => {
    expect(() =>
      assertSesInboundProcessJobData({
        sesMessageId: 'different-id',
        objectKey: 'incoming/abc123',
      }),
    ).toThrow('must match its S3 object key')
  })
})
