import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

export type MembershipOperationalCleanupOptions = {
  batchSize?: number
  maxBatches: number
  retentionDays?: number
  lowerBoundDate?: Date
  now?: Date
}

type CursorKind = 'entitlement_effects' | 'renewal_notices' | 'google_acknowledgments'
type CursorRow = { cursor_at: Date | null; cursor_id: string | null }
type Candidate = { id: string; due_at: Date }

export async function cleanupDeliveredMembershipEntitlementEffects(
  options: MembershipOperationalCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 30),
    options.now,
  )
  return runMembershipOperationalPages('entitlement_effects', cutoff, options)
}

export async function cleanupEndedMembershipRenewalNotices(
  options: MembershipOperationalCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  return runMembershipOperationalPages('renewal_notices', cutoff, options)
}

export async function cleanupTerminalGooglePlayAcknowledgments(
  options: MembershipOperationalCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  return runMembershipOperationalPages('google_acknowledgments', cutoff, options)
}

async function runMembershipOperationalPages(
  kind: CursorKind,
  cutoff: Date,
  options: MembershipOperationalCleanupOptions,
): Promise<{ deleted: number; hasMore: boolean }> {
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff)
    return { deleted: 0, hasMore: false }
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  // oxlint-disable no-await-in-loop -- each checkpoint determines the next keyset page
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: each call deletes a bounded SQL page; the persisted cursor serializes pages, not individual rows
    const page = await deleteMembershipOperationalPage(
      kind,
      cutoff,
      batchSize,
      options.lowerBoundDate,
    )
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  // oxlint-enable no-await-in-loop
  return { deleted, hasMore }
}

async function deleteMembershipOperationalPage(
  kind: CursorKind,
  cutoff: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<{ deleted: number; hasMore: boolean }> {
  await using transaction = await beginTransaction()
  const { rows: cursorRows } = await transaction<CursorRow>(sql`
    /* deleteMembershipOperationalPage.lockCursor */
    SELECT cursor_at, cursor_id FROM membership_operational_cleanup_cursors
    WHERE kind = ${kind} FOR UPDATE
  `)
  const cursor = cursorRows[0]
  if (!cursor) throw new Error(`Missing membership retention cursor: ${kind}`)
  const afterAt = cursor.cursor_at
  const afterId = cursor.cursor_id
  const lower = lowerBoundDate ?? null
  let rows: Candidate[]
  if (kind === 'entitlement_effects') {
    ;({ rows } = await transaction<Candidate>(sql`
      /* deleteMembershipOperationalPage.entitlementCandidates */
      SELECT id, delivered_at AS due_at FROM membership_entitlement_effects
      WHERE delivered_at IS NOT NULL AND delivered_at < ${cutoff}
        AND delivered_at >= COALESCE(${lower}::timestamptz, '-infinity'::timestamptz)
        AND (delivered_at, id) > (
          COALESCE(${afterAt}::timestamptz, '-infinity'::timestamptz),
          COALESCE(${afterId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      ORDER BY delivered_at, id LIMIT ${batchSize + 1} FOR UPDATE SKIP LOCKED
    `))
  } else if (kind === 'renewal_notices') {
    ;({ rows } = await transaction<Candidate>(sql`
      /* deleteMembershipOperationalPage.renewalCandidates */
      SELECT membership_id AS id, projection_ended_at AS due_at
      FROM membership_renewal_price_increase_notification_work_items
      WHERE projection_ended_at IS NOT NULL AND projection_ended_at < ${cutoff}
        AND projection_ended_at >= COALESCE(${lower}::timestamptz, '-infinity'::timestamptz)
        AND (projection_ended_at, membership_id) > (
          COALESCE(${afterAt}::timestamptz, '-infinity'::timestamptz),
          COALESCE(${afterId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      ORDER BY projection_ended_at, membership_id LIMIT ${batchSize + 1} FOR UPDATE SKIP LOCKED
    `))
  } else {
    ;({ rows } = await transaction<Candidate>(sql`
      /* deleteMembershipOperationalPage.googleCandidates */
      SELECT id, COALESCE(acknowledged_at, skipped_at) AS due_at
      FROM membership_google_play_acknowledgments
      WHERE (acknowledged_at IS NOT NULL OR skipped_at IS NOT NULL)
        AND COALESCE(acknowledged_at, skipped_at) < ${cutoff}
        AND COALESCE(acknowledged_at, skipped_at) >= COALESCE(${lower}::timestamptz, '-infinity'::timestamptz)
        AND (COALESCE(acknowledged_at, skipped_at), id) > (
          COALESCE(${afterAt}::timestamptz, '-infinity'::timestamptz),
          COALESCE(${afterId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      ORDER BY COALESCE(acknowledged_at, skipped_at), id
      LIMIT ${batchSize + 1} FOR UPDATE SKIP LOCKED
    `))
  }
  const page = rows.slice(0, batchSize)
  const ids = page.map(row => row.id)
  let deleted = 0
  if (ids.length > 0) {
    if (kind === 'entitlement_effects') {
      const result = await transaction(sql`/* deleteMembershipOperationalPage.entitlementDelete */
        DELETE FROM membership_entitlement_effects WHERE id = ANY(${ids}::uuid[])
          AND delivered_at < ${cutoff}`)
      deleted = result.rowCount ?? 0
    } else if (kind === 'renewal_notices') {
      const result = await transaction(sql`/* deleteMembershipOperationalPage.renewalDelete */
        DELETE FROM membership_renewal_price_increase_notification_work_items
        WHERE membership_id = ANY(${ids}::uuid[]) AND projection_ended_at < ${cutoff}`)
      deleted = result.rowCount ?? 0
    } else {
      const result = await transaction(sql`/* deleteMembershipOperationalPage.googleDelete */
        DELETE FROM membership_google_play_acknowledgments
        WHERE id = ANY(${ids}::uuid[])
          AND COALESCE(acknowledged_at, skipped_at) < ${cutoff}`)
      deleted = result.rowCount ?? 0
    }
  }
  const hasMore = rows.length > batchSize
  const last = hasMore ? page.at(-1) : undefined
  await transaction(sql`/* deleteMembershipOperationalPage.checkpoint */
    UPDATE membership_operational_cleanup_cursors
    SET cursor_at = ${last?.due_at ?? null}, cursor_id = ${last?.id ?? null}::uuid
    WHERE kind = ${kind}
  `)
  await transaction.commit()
  return { deleted, hasMore }
}
