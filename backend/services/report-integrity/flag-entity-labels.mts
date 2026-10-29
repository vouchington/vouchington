import { read, type QueryExecutor } from '@data-stores/psql'
import { attachReportIntegrityFlagLabels, type ReportFlagLabels } from '@services/integrity-labels'
import type { ReportIntegrityFlag } from './create-flag.mts'

/** Hydrate one bounded page with target facts; keep flag IDs for API mutations only. */
export function attachReportFlagEntityLabels<T extends ReportIntegrityFlag>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<Array<T & ReportFlagLabels>> {
  return attachReportIntegrityFlagLabels(flags, query)
}
