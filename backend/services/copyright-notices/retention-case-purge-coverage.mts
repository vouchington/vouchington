import type { TransactionQuery } from '@data-stores/psql'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import {
  COPYRIGHT_CASE_GLOBAL_REPORT_FAMILIES,
  readCopyrightCaseGlobalReportCoveragePage,
} from './retention-case-purge-report-coverage.mts'
import {
  EU_REPORT_FACT_FAMILIES,
  readEuCopyrightReportCoveragePage,
} from './eu-report-coverage.mts'

export async function verifyCopyrightCaseReportCoveragePage(
  query: TransactionQuery,
  data: CopyrightCasePurgeJobData,
  jurisdiction: string,
  pageSize: number,
): Promise<{ data: CopyrightCasePurgeJobData; hasMore: boolean }> {
  const globalFamily = COPYRIGHT_CASE_GLOBAL_REPORT_FAMILIES[data.phaseIndex]
  const euIndex = data.phaseIndex - COPYRIGHT_CASE_GLOBAL_REPORT_FAMILIES.length
  const euFamily = EU_REPORT_FACT_FAMILIES[euIndex]
  if (!globalFamily && (!euFamily || jurisdiction !== 'eu_dsa'))
    return { data: { ...data, phase: 'evidence', phaseIndex: 0, afterId: null }, hasMore: true }
  const page = globalFamily
    ? await readCopyrightCaseGlobalReportCoveragePage(
        query,
        data.noticeId,
        globalFamily,
        data.afterId,
        pageSize,
      )
    : await readEuCopyrightReportCoveragePage(
        query,
        data.noticeId,
        euFamily!,
        data.afterId,
        pageSize,
      )
  if (!page.covered) return { data, hasMore: false }
  return {
    data: {
      ...data,
      phaseIndex: page.hasMore ? data.phaseIndex : data.phaseIndex + 1,
      afterId: page.hasMore ? page.nextId : null,
    },
    hasMore: true,
  }
}
