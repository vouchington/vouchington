import { describe, expect, it } from 'vitest'
import {
  assertSesInboundProcessJobData,
  createSesInboundProcessJobId,
  decodeS3EventObjectKey,
  getSesInboundProcessJobOptions,
  getSesMessageIdFromObjectKey,
  SES_INBOUND_FAILED_PREFIX,
  SES_INBOUND_COPYRIGHT_PREFIX,
  SES_INBOUND_PROCESS_JOB_NAME,
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
} from './index.mts'

describe('SES inbound contract', () => {
  it('exposes the stable queue and job names', () => {
    expect(SES_INBOUND_QUEUE_NAME).toBe('ses_inbound')
    expect(SES_INBOUND_PROCESS_JOB_NAME).toBe('processInboundEmail')
    expect(SES_INBOUND_RECONCILE_JOB_NAME).toBe('reconcileInboundEmail')
    expect(SES_INBOUND_COPYRIGHT_PREFIX).toBe('copyright-incoming/')
    expect(SES_INBOUND_FAILED_PREFIX).toBe('failed/')
  })

  it('decodes S3 event keys and derives the SES message ID', () => {
    const objectKey = decodeS3EventObjectKey('copyright-incoming%2Fabc-123_456.test')

    expect(objectKey).toBe('copyright-incoming/abc-123_456.test')
    expect(getSesMessageIdFromObjectKey(objectKey)).toBe('abc-123_456.test')
  })

  it('rejects malformed or unexpected S3 object keys', () => {
    expect(() => decodeS3EventObjectKey('copyright-incoming%2Finvalid%ZZ')).toThrow(
      'not valid URL encoding',
    )
    expect(() => getSesMessageIdFromObjectKey('failed/abc123')).toThrow('unknown prefix')
    expect(() => getSesMessageIdFromObjectKey('incoming/abc123')).toThrow('unknown prefix')
    expect(() => getSesMessageIdFromObjectKey('copyright-incoming/folder/abc123')).toThrow(
      'exactly one SES message ID',
    )
    expect(getSesMessageIdFromObjectKey('copyright-incoming/abc+123=opaque')).toBe('abc+123=opaque')
  })

  it('creates deterministic process job IDs and options', () => {
    const objectKey = 'copyright-incoming/abc123'
    const jobId = createSesInboundProcessJobId(objectKey)

    expect(jobId).toBe(
      'ses-inbound-process-0cd03dda0b4ff93942bd529d881d37d233e8cce2851d5ff1f36dda7afca299dd',
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
        objectKey: 'copyright-incoming/abc123',
      }),
    ).toThrow('must match its S3 object key')
  })

  it('rejects a non-copyright object key', () => {
    expect(() =>
      assertSesInboundProcessJobData({
        sesMessageId: 'complaint-123',
        objectKey: 'incoming/complaint-123',
      }),
    ).toThrow('unknown prefix')
  })
})
