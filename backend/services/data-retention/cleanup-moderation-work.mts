import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Cursor = { completedAt: string; versionId: string; source: string }
type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  /** Existing-DB tests use owned version IDs and a rollback-scoped cursor. */
  versionIds?: readonly string[]
  query?: TransactionQuery
}
type Progress = {
  cursor_completed_at: string | null
  cursor_version_id: string | null
  cursor_source: string | null
  sweep_upper_bound_completed_at: string | null
}

export async function cleanupTerminalModerationWork(
  options: Options,
): Promise<PersistedPage<Cursor>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  return runPersistedRetentionPages(options, batchSize =>
    deleteTerminalModerationWorkPage(cutoff, batchSize, options),
  )
}

async function deleteTerminalModerationWorkPage(
  cutoff: Date,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<Cursor>> {
  await using owned = options.query ? undefined : await beginTransaction()
  const query = options.query ?? owned!
  await query(`/* ensureModerationWorkRetentionCursor */
    INSERT INTO post_moderation_work_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  const progress = (
    await query<Progress>(`/* lockModerationWorkRetentionCursor */
      SELECT cursor_completed_at::text, cursor_version_id, cursor_source,
        sweep_upper_bound_completed_at::text
      FROM post_moderation_work_retention_cursors WHERE is_singleton FOR UPDATE`)
  ).rows[0]
  const upperBound = progress.sweep_upper_bound_completed_at ?? cutoff.toISOString()
  const scopedPredicate = options.versionIds ? 'AND version_id = ANY($6::uuid[])' : ''
  const lowerBoundPredicate = options.lowerBoundDate
    ? `AND completed_at >= $${options.versionIds ? 7 : 6}::timestamptz`
    : ''
  const { rows: candidates } = await query<{
    completed_at: string
    version_id: string
    source: string
  }>(
    `/* selectModerationWorkRetentionPage */
    SELECT completed_at::text, version_id, source
    FROM post_moderation_work_items work
    WHERE completed_at IS NOT NULL AND completed_at < $1::timestamptz
      AND (completed_at, version_id, source) >
        (COALESCE($2::timestamptz, '-infinity'::timestamptz),
         COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
         COALESCE($4::post_moderation_sources, 'openai_omni'::post_moderation_sources))
      ${scopedPredicate}
      ${lowerBoundPredicate}
    ORDER BY work.completed_at, work.version_id, work.source
    LIMIT $5 FOR UPDATE`,
    [
      upperBound,
      progress.cursor_completed_at,
      progress.cursor_version_id,
      progress.cursor_source,
      batchSize + 1,
      ...(options.versionIds ? [options.versionIds] : []),
      ...(options.lowerBoundDate ? [options.lowerBoundDate] : []),
    ],
  )
  const page = candidates.slice(0, batchSize)
  // Preserve the disposition while unlinking only the expired provider attempt it references.
  await query(
    `/* unlinkExpiredModerationDispositionAttempts */
    UPDATE post_moderation_dispositions disposition SET attempt_id = NULL
    WHERE attempt_id IN (
      SELECT attempt.id FROM post_moderation_attempts attempt
      JOIN unnest($1::uuid[], $2::post_moderation_sources[]) selected(version_id, source)
        ON attempt.version_id = selected.version_id AND attempt.source = selected.source
    )`,
    [page.map(row => row.version_id), page.map(row => row.source)],
  )
  const { rowCount } = await query(
    `/* deleteTerminalModerationWorkPage */
    DELETE FROM post_moderation_work_items work
    USING unnest($1::uuid[], $2::post_moderation_sources[]) selected(version_id, source)
    WHERE work.version_id = selected.version_id AND work.source = selected.source`,
    [page.map(row => row.version_id), page.map(row => row.source)],
  )
  const last = page.at(-1)
  const hasMore = candidates.length > batchSize
  await query(
    `/* checkpointModerationWorkRetentionPage */
    UPDATE post_moderation_work_retention_cursors
    SET cursor_completed_at = $1::timestamptz, cursor_version_id = $2::uuid,
      cursor_source = $3::post_moderation_sources,
      sweep_upper_bound_completed_at = $4::timestamptz
    WHERE is_singleton`,
    [
      hasMore ? last!.completed_at : null,
      hasMore ? last!.version_id : null,
      hasMore ? last!.source : null,
      hasMore ? upperBound : null,
    ],
  )
  if (owned) await owned.commit()
  return {
    deleted: rowCount ?? 0,
    hasMore,
    continuation: hasMore
      ? {
          completedAt: last!.completed_at,
          versionId: last!.version_id,
          source: last!.source,
        }
      : null,
  }
}
