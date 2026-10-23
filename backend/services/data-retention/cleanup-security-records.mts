import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { DataRetentionLimits } from './config.mts'

import { SOURCES, sourcePlan, type Source } from './security-record-plans.mts'

type Page = { deleted: number; hasMore: boolean }

/** Every source owns a durable (eligibility timestamp, UUIDv7 id) cursor. */
export async function cleanupSecurityRecords(
  limits: DataRetentionLimits,
  now = new Date(),
): Promise<Page> {
  const maxBatches = Math.min(limits.maxBatches, SOURCES.length)
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1) {
    throw new RangeError('Security cleanup requires a positive maxBatches')
  }
  if (!Number.isSafeInteger(limits.batchSize) || limits.batchSize < 1) {
    throw new RangeError('Security cleanup requires a positive batchSize')
  }
  // Rotate the first source daily: a small run cap cannot starve the later families.
  const start = Math.floor(now.getTime() / 86_400_000) % SOURCES.length
  let deleted = 0
  let hasMore = maxBatches < SOURCES.length
  for (let index = 0; index < maxBatches; index++) {
    const source = SOURCES[(start + index) % SOURCES.length]!
    // oxlint-disable-next-line no-await-in-loop -- each source commits its own cursor and bounded deletion page.
    const page = await cleanupSecuritySourcePage(source, limits.batchSize, now) // no-mistakes-disable-line query-reached-per-item: at most 11 fixed families, each owns a locked cursor and one indexed batchSize+1 page
    deleted += page.deleted
    hasMore ||= page.hasMore
  }
  return { deleted, hasMore }
}

export async function cleanupSecuritySourcePage(
  source: Source,
  batchSize: number,
  now: Date,
): Promise<Page> {
  const plan = sourcePlan(source, now)
  const cutoffId = getMinUUIDv7ForDate(plan.cutoffAt)
  await using query = await beginTransaction()
  await query(
    `/* ensureSecurityRetentionCursor */
     INSERT INTO security_retention_cleanup_cursors (source)
     VALUES ($1::security_retention_sources) ON CONFLICT (source) DO NOTHING`,
    [source],
  )
  const progress = await query<{ cursor_at: Date | null; cursor_id: string | null }>(
    `/* lockSecurityRetentionCursor */
     SELECT cursor_at, cursor_id FROM security_retention_cleanup_cursors
     WHERE source = $1::security_retention_sources FOR UPDATE`,
    [source],
  )
  const cursor = progress.rows[0]
  if (!cursor) throw new Error(`Security retention cursor missing for ${source}`)
  const idKeyed =
    source === 'oauth_events' ||
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
  const page = await query<{ id: string; key_at: Date }>(
    `/* listSecurityRetentionPage:${source} */
     SELECT target.id, ${plan.keyAt} AS key_at
     FROM ${plan.table} target
     WHERE ${plan.predicate} AND ${keyset}
     ORDER BY ${order} LIMIT ${limitParameter}
     FOR UPDATE OF target SKIP LOCKED`,
    pageParameters,
  )
  const selected = page.rows.slice(0, batchSize)
  if (source === 'oauth_events') {
    // The trigger accepts only old, nonessential events inside this transaction.
    await query(
      `/* authorizeOAuthEventRetention */ SELECT set_config('app.oauth_event_retention_cutoff', $1, true)`,
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
  const last = hasMore ? selected.at(-1)! : null
  await query(
    `/* checkpointSecurityRetentionCursor */
     UPDATE security_retention_cleanup_cursors
     SET cursor_at = $2, cursor_id = $3
     WHERE source = $1::security_retention_sources`,
    [source, last?.key_at ?? null, last?.id ?? null],
  )
  await query.commit()
  return { deleted, hasMore }
}
