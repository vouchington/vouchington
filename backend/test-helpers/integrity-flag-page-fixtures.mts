import { v7 as uuidv7 } from 'uuid'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { runWithTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

export function createOwnedIntegrityFlagQuery(
  resource: 'report-integrity-flags' | 'vote-integrity-flags',
) {
  return (id: string, status?: 'pending' | 'resolved') => ({
    limit: 1,
    after: encodeScopedUuidCursor(
      uuidAt(BigInt(`0x${id.replaceAll('-', '')}`) + 1n),
      JSON.stringify({ resource, status: status ?? 'all', order: 'id-desc' }),
    ),
    ...(status ? { status } : {}),
  })
}

type OwnedFlag = { id: string; targetId: string }
type LayoutRow = { old_id: string; id: string; target_id: string }

function uuidAt(value: bigint): string {
  return value
    .toString(16)
    .padStart(32, '0')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
}

function pageLayout(pending: OwnedFlag, resolved: OwnedFlag) {
  if (pending.id === resolved.id || pending.targetId === resolved.targetId) {
    throw new Error('Mixed flag page requires two distinct owned flags and targets')
  }
  const base = BigInt(`0x${uuidv7().replaceAll('-', '')}`) & ~3n
  const pendingId = uuidAt(base)
  const resolvedId = uuidAt(base + 1n)
  const afterId = uuidAt(base + 2n)
  if ([pending.id, resolved.id].some(id => [pendingId, resolvedId].includes(id))) {
    throw new Error('Fresh page IDs overlap original flag IDs')
  }
  return { pendingId, resolvedId, afterId }
}

function verifyRows(
  rows: LayoutRow[],
  pending: OwnedFlag,
  resolved: OwnedFlag,
  layout: ReturnType<typeof pageLayout>,
) {
  const expected = [
    [pending.id, layout.pendingId, pending.targetId],
    [resolved.id, layout.resolvedId, resolved.targetId],
  ]
  if (
    rows.length !== 2 ||
    expected.some(
      ([oldId, id, targetId]) =>
        rows.filter(row => row.old_id === oldId && row.id === id && row.target_id === targetId)
          .length !== 1,
    )
  ) {
    throw new Error('Mixed page layout did not update exactly both owned pending flags')
  }
}

/** Only fresh, unreferenced pending report flags with no captured reporters. */
export async function arrangeReportIntegrityFlagPage(
  pending: OwnedFlag,
  resolved: OwnedFlag,
  resolvedAt: Date,
) {
  const layout = pageLayout(pending, resolved)
  await runWithTransaction(undefined, async query => {
    const { rows } = await query<LayoutRow>(sql`/* arrangeReportIntegrityFlagPage */
      WITH owned(old_id, new_id, target_id) AS (
        VALUES (${pending.id}::uuid, ${layout.pendingId}::uuid, ${pending.targetId}::uuid),
               (${resolved.id}::uuid, ${layout.resolvedId}::uuid, ${resolved.targetId}::uuid)
      ), locked AS MATERIALIZED (
        SELECT flag.id FROM report_integrity_flags flag
        JOIN owned ON flag.id = owned.old_id AND flag.reported_user_id = owned.target_id
        WHERE flag.resolved_at IS NULL AND flag.resolved_by_id IS NULL AND flag.resolution IS NULL
          AND flag.flag_type = 'mass_report_suspected'
          AND NOT EXISTS (SELECT 1 FROM report_integrity_flag_reporters WHERE flag_id = flag.id)
        ORDER BY flag.id FOR UPDATE OF flag
      )
      UPDATE report_integrity_flags flag
      SET id = owned.new_id,
          resolved_at = CASE WHEN owned.old_id = ${resolved.id}::uuid THEN ${resolvedAt}::timestamptz ELSE NULL END,
          resolution = CASE WHEN owned.old_id = ${resolved.id}::uuid THEN 'dismissed'::report_integrity_resolutions ELSE NULL END
      FROM owned JOIN locked ON locked.id = owned.old_id
      WHERE flag.id = owned.old_id AND flag.reported_user_id = owned.target_id
        AND flag.resolved_at IS NULL AND flag.resolved_by_id IS NULL AND flag.resolution IS NULL
      RETURNING owned.old_id, flag.id, flag.reported_user_id AS target_id
    `)
    verifyRows(rows, pending, resolved, layout)
  })
  return layout
}

/** Rekey before the real resolution request creates any moderator-action reference. */
export async function arrangeVoteIntegrityFlagPage(pending: OwnedFlag, resolved: OwnedFlag) {
  const layout = pageLayout(pending, resolved)
  await runWithTransaction(undefined, async query => {
    const { rows } = await query<LayoutRow>(sql`/* arrangeVoteIntegrityFlagPage */
      WITH owned(old_id, new_id, target_id) AS (
        VALUES (${pending.id}::uuid, ${layout.pendingId}::uuid, ${pending.targetId}::uuid),
               (${resolved.id}::uuid, ${layout.resolvedId}::uuid, ${resolved.targetId}::uuid)
      ), locked AS MATERIALIZED (
        SELECT flag.id FROM vote_integrity_flags flag
        JOIN owned ON flag.id = owned.old_id AND flag.post_id = owned.target_id
        WHERE flag.resolved_at IS NULL AND flag.resolved_by_id IS NULL AND flag.resolution IS NULL
          AND flag.flag_type = 'velocity_spike'
        ORDER BY flag.id FOR UPDATE OF flag
      )
      UPDATE vote_integrity_flags flag SET id = owned.new_id
      FROM owned JOIN locked ON locked.id = owned.old_id
      WHERE flag.id = owned.old_id AND flag.post_id = owned.target_id
        AND flag.resolved_at IS NULL AND flag.resolved_by_id IS NULL AND flag.resolution IS NULL
      RETURNING owned.old_id, flag.id, flag.post_id AS target_id
    `)
    verifyRows(rows, pending, resolved, layout)
  })
  return layout
}
