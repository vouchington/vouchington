import onError from '@modules/on-error'
import type { AnalyticsTableName, AnalyticsTableRegistry } from './tables.mts'
import { writeRecord as writeLocalRecord } from './backend-local.mts'
import { writeRecord as writeFirehoseRecord } from './backend-firehose.mts'
import { parseAnalyticsBackend } from './config.mts'

export function emit<T extends AnalyticsTableName>(
  table: T,
  record: AnalyticsTableRegistry[T],
): void {
  // Read backend at call time so env-var overrides take effect immediately
  const backend = parseAnalyticsBackend(process.env.ANALYTICS_BACKEND ?? 'disabled')

  if (backend === 'disabled') return

  try {
    if (backend === 'local') {
      writeLocalRecord(table, record)
      return
    }

    writeFirehoseRecord(table, record)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
