import type { EmailDispatcherJobs } from '../types.mts'
import { asRecord, assertExactKeys, optionalString } from './job-payload-read.mts'

export function dispatcherPayload(name: EmailDispatcherJobs, data: unknown): { afterId?: string } {
  const record = asRecord(data ?? {}, 'payload')
  assertExactKeys(record, name === 'dispatchApiKeyExpiryReminders' ? ['afterId'] : [])
  optionalString(record, 'afterId')
  return typeof record.afterId === 'string' ? { afterId: record.afterId } : {}
}
