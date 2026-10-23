import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { lockCopyrightRationaleRetentionPage } from '@services/copyright-notices/retention-erasure-preservation'
import { sourcePlan, type Source } from './security-record-plans.mts'

/** Run one cursor page inside the caller's transaction; the caller owns commit or rollback. */
export async function cleanupSecuritySourcePageInTransaction(
  query: TransactionQuery,
  source: Source,
  batchSize: number,
  now: Date,
): Promise<{ deleted: number; hasMore: boolean }> {
  const plan = sourcePlan(source, now)
  const cutoffId = getMinUUIDv7ForDate(plan.cutoffAt)
  await query(
    `/* ensureSecurityRetentionCursor */
     INSERT INTO security_retention_cleanup_cursors (source)
     VALUES ($1::security_retention_sources) ON CONFLICT (source) DO NOTHING`,
    [source],
  )
  const progress = await query<{ cursor_at: string | null; cursor_id: string | null }>(
    `/* lockSecurityRetentionCursor */
     SELECT cursor_at::text AS cursor_at, cursor_id FROM security_retention_cleanup_cursors
     WHERE source = $1::security_retention_sources FOR UPDATE`,
    [source],
  )
  const cursor = progress.rows[0]
  if (!cursor) throw new Error(`Security retention cursor missing for ${source}`)
  const idKeyed =
    source === 'oauth_events' ||
    source === 'oauth_native_mints' ||
    source === 'oauth_clients' ||
    source === 'copyright_rationales_erased' ||
    source === 'copyright_rationales_noncase'
  const keyset = idKeyed
    ? '($2::uuid IS NULL OR target.id > $2::uuid)'
    : `($2::timestamptz IS NULL OR (${plan.keyAt}, target.id) > ($2::timestamptz, $3::uuid))`
  const order = idKeyed ? 'target.id' : `${plan.keyAt}, target.id`
  // Every prepared-statement parameter must occur in its branch's SQL. Supplying the timestamp
  // cursor to an id-keyed page leaves $1/$2 untyped and PostgreSQL rejects the statement.
  const pageParameters: unknown[] = idKeyed
    ? [cutoffId, cursor.cursor_id, batchSize + 1]
    : [plan.cutoffAt, cursor.cursor_at, cursor.cursor_id, batchSize + 1]
  const limitParameter = idKeyed ? '$3::integer' : '$4::integer'
  const needsAccountLocks = source === 'copyright_rationales_noncase'
  const page = await query<{ id: string; key_at: string }>(
    `/* listSecurityRetentionPage:${source} */
     SELECT target.id, (${plan.keyAt})::text AS key_at
     FROM ${plan.table} target
     WHERE ${plan.predicate} AND ${keyset}
     ORDER BY ${order} LIMIT ${limitParameter}
     ${needsAccountLocks ? '' : 'FOR UPDATE OF target SKIP LOCKED'}`,
    pageParameters,
  )
  const scanned = page.rows.slice(0, batchSize)
  let selected = scanned
  if (needsAccountLocks && scanned.length > 0) {
    const lockedIds = await lockCopyrightRationaleRetentionPage(
      query,
      scanned.map(row => row.id),
    )
    selected = scanned.filter(row => lockedIds.has(row.id))
  }
  if (source === 'oauth_events') {
    // The trigger accepts only old, nonessential events inside this transaction.
    await query(
      `/* authorizeOAuthEventRetention */ SELECT set_config('app.oauth_event_retention_cutoff', $1, true)`,
      [plan.cutoffAt.toISOString()],
    )
  }
  if (source === 'oauth_native_mints') {
    await query(
      `/* authorizeNativeMintRetention */ SELECT set_config('app.oauth_native_mint_retention_cutoff', $1, true)`,
      [plan.cutoffAt.toISOString()],
    )
  }
  if (source === 'copyright_rationales_erased' || source === 'copyright_rationales_noncase') {
    await query(
      `/* authorizeCopyrightRationaleRetention */ SELECT set_config('app.copyright_rationale_retention_cutoff', $1, true)`,
      [plan.cutoffAt.toISOString()],
    )
  }
  let deleted = 0
  if (selected.length > 0) {
    const deleteParameters: unknown[] = [selected.map(row => row.id)]
    if (plan.deletePredicateUsesCutoff) deleteParameters.push(plan.cutoffAt)
    const result = await query(
      `/* deleteSecurityRetentionPage:${source} */
       DELETE FROM ${plan.table} target
       WHERE target.id = ANY($1::uuid[]) AND ${plan.deletePredicate ?? 'TRUE'}`,
      deleteParameters,
    )
    deleted = result.rowCount ?? 0
  }
  const hasMore = page.rows.length > batchSize
  const last = hasMore ? scanned.at(-1)! : null
  await query(
    `/* checkpointSecurityRetentionCursor */
     UPDATE security_retention_cleanup_cursors
     SET cursor_at = $2::timestamptz, cursor_id = $3::uuid
     WHERE source = $1::security_retention_sources`,
    [source, last?.key_at ?? null, last?.id ?? null],
  )
  return { deleted, hasMore }
}
