import { write } from '@data-stores/psql'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import sql from 'sql-template-strings'
import { CLASSIFIER_TERMINAL_WINDOW_MS } from './health-thresholds.mts'

/**
 * Runs of one classifier reserved inside the window, by how they ended. `failed` is keyed by the
 * terminal failure kind (`client-unavailable` is the missing-key terminal) and omits kinds that
 * did not occur. The window is by reservation time, because the run `id` is the only indexed time.
 */
export type ClassifierTerminalCounts = {
  completed: number
  superseded: number
  incomplete: number
  failed: Record<string, number>
  failedTotal: number
}

type OutcomeRow = { outcome: string; total: number }

const FAILED_PREFIX = 'failed:'

export async function readClassifierTerminalCounts(
  classifier: string,
  now: Date,
): Promise<ClassifierTerminalCounts> {
  const since = timestampToUuidv7LowerBound(now.getTime() - CLASSIFIER_TERMINAL_WINDOW_MS)
  const { rows } = await write<OutcomeRow>(sql`/* readClassifierTerminalCounts */
    SELECT CASE
        WHEN run.completed_at IS NOT NULL THEN 'completed'
        WHEN run.terminal_failure_kind IS NOT NULL THEN ${FAILED_PREFIX}::text || run.terminal_failure_kind
        WHEN run.superseded_at IS NOT NULL THEN 'superseded'
        ELSE 'incomplete'
      END AS outcome,
      count(*)::int AS total
    FROM classifier_runs run
    WHERE run.classifier_id = (SELECT id FROM classifiers WHERE slug = ${classifier})
      AND run.id >= ${since}
    GROUP BY 1
  `)
  const counts: ClassifierTerminalCounts = {
    completed: 0,
    superseded: 0,
    incomplete: 0,
    failed: {},
    failedTotal: 0,
  }
  for (const { outcome, total } of rows) {
    if (outcome.startsWith(FAILED_PREFIX)) {
      counts.failed[outcome.slice(FAILED_PREFIX.length)] = total
      counts.failedTotal += total
    } else if (outcome === 'completed' || outcome === 'superseded' || outcome === 'incomplete') {
      counts[outcome] = total
    }
  }
  return counts
}
