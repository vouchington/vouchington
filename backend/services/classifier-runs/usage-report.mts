import { write } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import sql from 'sql-template-strings'
import { assertClassifierUsageWindow, readClassifierRunUsage } from './usage-report-runs.mts'
import {
  summarizeClassifierContentVersions,
  summarizeClassifierEfficiency,
} from './usage-report-efficiency.mts'
import { summarizeClassifierUsage } from './usage-report-summary.mts'
import type { ClassifierUsageReport, ClassifierUsageWindow } from './usage-report-types.mts'

/**
 * @public Cross-workspace read boundary: `backend/scripts/classifier-call-efficiency.mts` runs it
 * against an environment for the Epic C KPI check (C10, #223).
 *
 * The one cost, latency and fan-out report for every fixed classifier: one row per run reserved in
 * the window, with the ledger usage attributed to it, the same rows summed per classifier, prompt
 * version and scope, and per content version, with each classifier's calls per content version.
 * It reuses the ai-usage ledger and adds no second metrics path.
 */
export async function readClassifierUsageReport(
  window: ClassifierUsageWindow,
): Promise<ClassifierUsageReport> {
  const runs = await readClassifierRunUsage(window)
  const contentVersions = summarizeClassifierContentVersions(runs)
  return {
    window,
    runs,
    groups: summarizeClassifierUsage(runs),
    contentVersions,
    efficiency: summarizeClassifierEfficiency(contentVersions),
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
