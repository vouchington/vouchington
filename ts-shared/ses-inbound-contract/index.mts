import { createHash } from 'node:crypto'

export const SES_INBOUND_QUEUE_NAME = 'ses_inbound'
export const SES_INBOUND_PROCESS_JOB_NAME = 'processInboundEmail'
export const SES_INBOUND_RECONCILE_JOB_NAME = 'reconcileInboundEmail'
export const SES_INBOUND_COPYRIGHT_PREFIX = 'copyright-incoming/'
export const SES_INBOUND_FAILED_PREFIX = 'failed/'

export type SesInboundProcessJobData = {
  sesMessageId: string
  objectKey: string
}

export type SesInboundReconcileJobData = { continuationToken?: string }

export function assertSesInboundReconcileJobData(
  data: unknown,
): asserts data is SesInboundReconcileJobData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('SES inbound reconcile job data must be an object')
  }
  const entries = Object.entries(data)
  if (entries.some(([key]) => key !== 'continuationToken')) {
    throw new Error('SES inbound reconcile job data has an unknown field')
  }
  const token = (data as SesInboundReconcileJobData).continuationToken
  if (
    token !== undefined &&
    (typeof token !== 'string' || token.length === 0 || token.length > 1024)
  ) {
    throw new Error(
      'SES inbound continuation token must be a non-empty string of at most 1024 characters',
    )
  }
}

export type SesInboundProcessJobOptions = {
  attempts: 3
  backoff: {
    type: 'exponential'
    delay: 1000
    jitter: 0.5
  }
  removeOnComplete: 100
  removeOnFail: 100
  priority: 10
  jobId: string
  deduplication: {
    id: string
    mode: 'simple'
  }
}

export function decodeS3EventObjectKey(encodedKey: string): string {
  if (!encodedKey) throw new Error('S3 event object key is required')

  try {
    return decodeURIComponent(encodedKey.replaceAll('+', ' '))
  } catch {
    throw new Error('S3 event object key is not valid URL encoding')
  }
}

export function getSesMessageIdFromObjectKey(objectKey: string): string {
  if (!objectKey.startsWith(SES_INBOUND_COPYRIGHT_PREFIX)) {
    throw new Error('SES inbound object key has an unknown prefix')
  }
  const sesMessageId = objectKey.slice(SES_INBOUND_COPYRIGHT_PREFIX.length)
  if (!sesMessageId || sesMessageId.includes('/')) {
    throw new Error('SES inbound object key must contain exactly one SES message ID')
  }
  return sesMessageId
}

export function createSesInboundProcessJobId(objectKey: string): string {
  const digest = createHash('sha256').update(objectKey).digest('hex')
  return `ses-inbound-process-${digest}`
}

export function assertSesInboundProcessJobData(data: SesInboundProcessJobData): void {
  const expectedSesMessageId = getSesMessageIdFromObjectKey(data.objectKey)
  if (data.sesMessageId !== expectedSesMessageId) {
    throw new Error('SES inbound job message ID must match its S3 object key')
  }
}

export function getSesInboundProcessJobOptions(
  data: SesInboundProcessJobData,
): SesInboundProcessJobOptions {
  assertSesInboundProcessJobData(data)
  const logicalId = createSesInboundProcessJobId(data.objectKey)
  return {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: 10,
    jobId: logicalId,
    deduplication: { id: logicalId, mode: 'simple' },
  }
}
