import { UnrecoverableError } from 'glide-mq'
import type { AccountLifecycleExportRequestData } from '@queues/background/enqueues/account-lifecycle-jobs'

/** A retry cannot repair a malformed payload, so the worker fails the job without retrying. */
export class AccountLifecycleJobPayloadError extends UnrecoverableError {
  constructor(detail: string) {
    super(`Invalid account lifecycle job payload: ${detail}`)
    this.name = 'AccountLifecycleJobPayloadError'
  }
}

/** The fenced export job: every field is a non-empty string, so a malformed job claims nothing. */
export function parseExportRequestJobData(data: unknown): AccountLifecycleExportRequestData {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new AccountLifecycleJobPayloadError('data must be an object')
  }
  const record = data as Record<string, unknown>
  for (const key of ['requestId', 'userId', 'processingAttemptId'] as const) {
    const value = record[key]
    if (typeof value !== 'string' || value === '') {
      throw new AccountLifecycleJobPayloadError(`${key} must be a non-empty string`)
    }
  }
  return {
    requestId: record.requestId as string,
    userId: record.userId as string,
    processingAttemptId: record.processingAttemptId as string,
  }
}
