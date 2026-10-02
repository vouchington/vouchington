import { write } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import sql from 'sql-template-strings'
import { assertClassifierUsageWindow, readClassifierRunUsage } from './usage-report-runs.mts'
import { summarizeClassifierUsage } from './usage-report-summary.mts'
import type { ClassifierUsageReport, ClassifierUsageWindow } from './usage-report-types.mts'

/**
 * @public Cross-workspace read boundary for the Epic C KPI check (C10, #223), which reads provider
 * calls per classifier scope per content version from it. No production caller exists until then.
 *
 * The one cost, latency and fan-out report for every fixed classifier: one row per run reserved in
 * the window, with the ledger usage attributed to it, and the same rows summed per classifier,
 * prompt version and scope. It reuses the ai-usage ledger and adds no second metrics path.
 */
export async function readClassifierUsageReport(
  window: ClassifierUsageWindow,
): Promise<ClassifierUsageReport> {
  const runs = await readClassifierRunUsage(window)
  return {
    window,
    runs,
    groups: summarizeClassifierUsage(runs),
    requests: await readClassifierRequestCounts(window),
  }
}

type RequestCountRow = { classifier: string; total: number }

async function readClassifierRequestCounts(
  window: ClassifierUsageWindow,
): Promise<Record<string, number>> {
  assertClassifierUsageWindow(window)
  const { rows } = await write<RequestCountRow>(sql`/* readClassifierRequestCounts */
    SELECT classifier.slug AS classifier, count(*)::int AS total
    FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE request.id >= ${timestampToUuidv7LowerBound(window.from.getTime())}
      AND request.id < ${timestampToUuidv7LowerBound(window.to.getTime())}
    GROUP BY classifier.slug
  `)
  return Object.fromEntries(rows.map(row => [row.classifier, row.total]))
}
