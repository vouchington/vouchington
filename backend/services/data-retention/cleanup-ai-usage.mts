import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

export type AiUsageCleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  upperBoundDate?: Date
}

export type AiUsageCleanupResult = {
  deleted: number
  hasMore: boolean
  cursorId: string | null
}

/** Fold and remove the same old call page atomically; completed months may be folded incrementally. */
export async function cleanupAiUsageRecords(
  options: AiUsageCleanupOptions,
): Promise<AiUsageCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const now = options.now ?? new Date()
  const retentionCutoff = getRetentionCutoffDate(
    Math.max(180, normalizeRetentionDays(options.retentionDays, 180)),
    now,
  )
  // #3544 owns 90-day response-key retirement. A background response can write a key today while
  // its raw usage id is backdated, so raw age alone must never cascade a younger replay key.
  const responseKeyCutoff = getMinUUIDv7ForDate(getRetentionCutoffDate(90, now))
  const cutoff = getMinUUIDv7ForDate(
    options.upperBoundDate && options.upperBoundDate < retentionCutoff
      ? options.upperBoundDate
      : retentionCutoff,
  )
  const lowerBound = options.lowerBoundDate ? getMinUUIDv7ForDate(options.lowerBoundDate) : null
  let result: AiUsageCleanupResult = { deleted: 0, hasMore: false, cursorId: null }
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: at most maxBatches transactions each lock a UUIDv7 keyset page, fold and delete its rows atomically, then checkpoint; the next page depends on that commit.
    const page = await cleanupAiUsagePage(cutoff, responseKeyCutoff, lowerBound, batchSize) // oxlint-disable-line no-await-in-loop -- the committed cursor selects the next bounded page
    result = {
      deleted: result.deleted + page.deleted,
      hasMore: page.hasMore,
      cursorId: page.cursorId,
    }
    if (!page.hasMore) break
  }
  return result
}

async function cleanupAiUsagePage(
  cutoff: string,
  responseKeyCutoff: string,
  lowerBound: string | null,
  batchSize: number,
): Promise<AiUsageCleanupResult> {
  await using transaction = await beginTransaction()
  const { rows: cursors } = await transaction<{
    cursor_id: string | null
    sweep_upper_bound_id: string | null
  }>(sql`
    /* cleanupAiUsagePage.lockCursor */
    SELECT cursor_id, sweep_upper_bound_id FROM ai_usage_retention_cursors
    WHERE is_singleton = true FOR UPDATE
  `)
  const progress = cursors[0]
  if (!progress) throw new Error('AI usage retention cursor is missing')
  const cursorId = progress.cursor_id
  const persistedUpperBound = progress.sweep_upper_bound_id
  const upperBound =
    persistedUpperBound && persistedUpperBound < cutoff ? persistedUpperBound : cutoff
  const candidates = sql`/* cleanupAiUsagePage.candidates */
    SELECT record.id FROM ai_usage_records record WHERE record.id < ${upperBound}::uuid`
  if (lowerBound) candidates.append(sql` AND record.id >= ${lowerBound}::uuid`)
  if (cursorId) candidates.append(sql` AND record.id > ${cursorId}::uuid`)
  candidates.append(sql` ORDER BY id LIMIT ${batchSize + 1} FOR UPDATE SKIP LOCKED`)
  const { rows } = await transaction<{ id: string }>(candidates)
  const scannedIds = rows.slice(0, batchSize).map(row => row.id)
  const { rows: protectedRows } = await transaction<{ ai_usage_record_id: string }>(sql`
    /* cleanupAiUsagePage.protectedKeys */
    SELECT ai_usage_record_id FROM ai_usage_provider_response_keys
    WHERE ai_usage_record_id = ANY(${scannedIds}::uuid[])
      AND id >= ${responseKeyCutoff}::uuid
  `)
  const protectedIds = new Set(protectedRows.map(row => row.ai_usage_record_id))
  const ids = scannedIds.filter(id => !protectedIds.has(id))

  let deleted = 0
  if (ids.length > 0) {
    const { rows: folded } = await transaction<{ deleted_count: string }>(sql`
      /* cleanupAiUsagePage.foldAndDelete */
      WITH deleted AS (
        DELETE FROM ai_usage_records record
        WHERE record.id = ANY(${ids}::uuid[])
        RETURNING id, community_id, input_tokens, output_tokens, pricing_status,
          cost_microunits
      ), facts AS MATERIALIZED (
        SELECT community_id,
          date_trunc('month', uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date AS month_start_on,
          input_tokens, output_tokens, pricing_status, cost_microunits
        FROM deleted
      ), community_rollups AS (
        INSERT INTO ai_usage_community_monthly_rollups (
          community_id, month_start_on, request_count, input_tokens, output_tokens,
          unpriced_request_count, cost_microunits, currency_code
        )
        SELECT community_id, month_start_on, count(*), sum(input_tokens), sum(output_tokens),
          count(*) FILTER (WHERE pricing_status = 'unpriced'),
          coalesce(sum(cost_microunits), 0)::bigint, 'usd'::currency_codes
        FROM facts WHERE community_id IS NOT NULL
        GROUP BY community_id, month_start_on
        ORDER BY community_id ASC NULLS LAST, month_start_on ASC NULLS LAST
        ON CONFLICT (community_id, month_start_on) DO UPDATE SET
          request_count = ai_usage_community_monthly_rollups.request_count + EXCLUDED.request_count,
          input_tokens = ai_usage_community_monthly_rollups.input_tokens + EXCLUDED.input_tokens,
          output_tokens = ai_usage_community_monthly_rollups.output_tokens + EXCLUDED.output_tokens,
          unpriced_request_count = ai_usage_community_monthly_rollups.unpriced_request_count + EXCLUDED.unpriced_request_count,
          cost_microunits = ai_usage_community_monthly_rollups.cost_microunits + EXCLUDED.cost_microunits
        RETURNING community_id
      ), global_rollups AS (
        INSERT INTO ai_usage_global_monthly_rollups (
          month_start_on, request_count, input_tokens, output_tokens,
          unpriced_request_count, cost_microunits, currency_code
        )
        SELECT month_start_on, count(*), sum(input_tokens), sum(output_tokens),
          count(*) FILTER (WHERE pricing_status = 'unpriced'),
          coalesce(sum(cost_microunits), 0)::bigint, 'usd'::currency_codes
        FROM facts GROUP BY month_start_on
        ORDER BY month_start_on ASC NULLS LAST
        ON CONFLICT (month_start_on) DO UPDATE SET
          request_count = ai_usage_global_monthly_rollups.request_count + EXCLUDED.request_count,
          input_tokens = ai_usage_global_monthly_rollups.input_tokens + EXCLUDED.input_tokens,
          output_tokens = ai_usage_global_monthly_rollups.output_tokens + EXCLUDED.output_tokens,
          unpriced_request_count = ai_usage_global_monthly_rollups.unpriced_request_count + EXCLUDED.unpriced_request_count,
          cost_microunits = ai_usage_global_monthly_rollups.cost_microunits + EXCLUDED.cost_microunits
        RETURNING month_start_on
      )
      SELECT (SELECT count(*) FROM deleted)::text AS deleted_count,
        (SELECT count(*) FROM community_rollups) AS community_months,
        (SELECT count(*) FROM global_rollups) AS global_months
    `)
    deleted = Number(folded[0]?.deleted_count ?? 0)
  }

  const hasMore = rows.length > batchSize
  const nextCursorId = hasMore ? scannedIds.at(-1)! : null
  await transaction(sql`/* cleanupAiUsagePage.checkpoint */
    UPDATE ai_usage_retention_cursors
    SET cursor_id = ${nextCursorId}::uuid,
      sweep_upper_bound_id = ${hasMore ? upperBound : null}::uuid
    WHERE is_singleton = true
  `)
  await transaction.commit()
  return { deleted, hasMore, cursorId: nextCursorId }
}
