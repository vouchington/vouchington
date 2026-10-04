import { parseReconcileEntity } from './job-payload-records.mts'
import { asRecord, assertExactKeys, JobPayloadError, requiredString } from './job-payload-read.mts'

export function parseReconciliationDispatch(data: unknown): Record<string, unknown> {
  if (data == null) return {}
  const record = asRecord(data, 'payload')
  assertExactKeys(record, ['window', 'after'])
  if (record.window !== undefined) {
    const window = asRecord(record.window, 'window')
    assertExactKeys(window, ['start', 'end'])
    requiredString(window, 'start')
    requiredString(window, 'end')
    const start = Date.parse(window.start as string)
    const end = Date.parse(window.end as string)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
      throw new JobPayloadError('invalid reconciliation window')
  }
  if (record.after !== undefined) {
    if (record.window === undefined) throw new JobPayloadError('cursor requires a fixed window')
    parseReconcileEntity(record.after)
  }
  return record
}
