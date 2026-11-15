import { write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runBoundedBatches } from './run-bounded-batches.mts'

export type CopyrightAiRunCleanupOptions = {
  batchSize?: number
  maxBatches: number
  retentionDays?: number
  now?: Date
  runIds?: readonly string[]
}

const RUN_TABLES = [
  'copyright_notice_appeal_recommendation_runs',
  'copyright_notice_submission_guidance_runs',
  'copyright_notice_email_intake_recommendation_runs',
] as const

/**
 * Deletes terminal per-attempt AI runs older than the retention window. Active runs are never
 * deleted. Runs are leaves: the immutable results they point to are not touched here, and a case
 * purge removes a case's runs before its results.
 */
export async function cleanupCopyrightAiRuns(
  options: CopyrightAiRunCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  const cutoffId = getMinUUIDv7ForDate(
    getRetentionCutoffDate(normalizeRetentionDays(options.retentionDays, 90), options.now),
  )
  const results = await Promise.all(
    RUN_TABLES.map(table =>
      runBoundedBatches(options, batchSize =>
        deleteTerminalRunBatch(table, cutoffId, batchSize, options.runIds),
      ),
    ),
  )
  return {
    deleted: results.reduce((total, result) => total + result.deleted, 0),
    hasMore: results.some(result => result.hasMore),
  }
}

async function deleteTerminalRunBatch(
  table: (typeof RUN_TABLES)[number],
  cutoffId: string,
  batchSize: number,
  runIds?: readonly string[],
): Promise<number> {
  const query = sql`/* deleteOldTerminalCopyrightAiRunBatch */
    WITH candidates AS (
      SELECT id FROM `.append(table).append(sql`
      WHERE id < ${cutoffId}::uuid AND status <> 'active'`)
  if (runIds) query.append(sql` AND id = ANY(${runIds}::uuid[])`)
  query.append(sql`
      ORDER BY id LIMIT ${batchSize}
    )
    DELETE FROM `)
  query.append(table)
  query.append(sql` AS run
    WHERE run.id = ANY(ARRAY(SELECT id FROM candidates))
      AND run.id < ${cutoffId}::uuid AND run.status <> 'active'
    RETURNING run.id`)
  const { rowCount } = await write(query)
  return rowCount ?? 0
}
