import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightRetentionWindows } from '../services/copyright-notices/config.mts'

export type CopyrightReplayRetentionIdentity = {
  id: string
  family: string
  outcome_code: string
  last_replayed_at: Date
}

export type CopyrightReplayRetentionGroup = {
  id: string
  case_purged_at: Date | null
  has_live_notice: boolean
  receipt_count: number
  identities: CopyrightReplayRetentionIdentity[]
}

/** Look up a live notice's opaque group without exposing case linkage in retained rows. */
export async function readCopyrightReplayRetentionGroupId(
  noticeId: string,
): Promise<string | null> {
  const { rows } = await read<{ copyright_replay_retention_group_id: string }>(
    sql`/* readCopyrightReplayRetentionGroupIdForFixture */
      SELECT copyright_replay_retention_group_id FROM copyright_notices WHERE id = ${noticeId}`,
  )
  return rows[0]?.copyright_replay_retention_group_id ?? null
}

/** Read only the independently owned replay retention group and its minimized identity facts. */
export async function readCopyrightReplayRetentionGroup(
  groupId: string,
): Promise<CopyrightReplayRetentionGroup | null> {
  const { rows } = await read<{
    group_id: string
    case_purged_at: Date | null
    has_live_notice: boolean
    receipt_count: number
    identity_id: string | null
    family: string | null
    outcome_code: string | null
    last_replayed_at: Date | null
  }>(sql`/* readOwnedCopyrightReplayRetentionGroup */
    SELECT group_row.id AS group_id, group_row.case_purged_at,
      EXISTS (SELECT 1 FROM copyright_notices notice
        WHERE notice.copyright_replay_retention_group_id = group_row.id) AS has_live_notice,
      (SELECT count(*)::integer FROM copyright_notice_replay_receipts receipt
        WHERE receipt.copyright_replay_retention_group_id = group_row.id) AS receipt_count,
      identity.id AS identity_id, identity.family::text AS family, identity.outcome_code::text AS outcome_code,
      identity.last_replayed_at
    FROM copyright_replay_retention_groups group_row
    LEFT JOIN copyright_replay_identities identity
      ON identity.copyright_replay_retention_group_id = group_row.id
    WHERE group_row.id = ${groupId}
    ORDER BY identity.id`)
  const first = rows[0]
  if (!first) return null
  return {
    id: first.group_id,
    case_purged_at: first.case_purged_at,
    has_live_notice: first.has_live_notice,
    receipt_count: first.receipt_count,
    identities: rows.flatMap(row =>
      row.identity_id && row.family && row.outcome_code && row.last_replayed_at
        ? [
            {
              id: row.identity_id,
              family: row.family,
              outcome_code: row.outcome_code,
              last_replayed_at: row.last_replayed_at,
            },
          ]
        : [],
    ),
  }
}

/** Exercise the canonical retention trigger without mutating the global cleanup cursor. */
export async function tryDeleteCopyrightReplayIdentityAt(input: {
  identityId: string
  groupId: string
  purgeNow: Date
}): Promise<boolean> {
  await using query = await beginTransaction()
  const { rows: groups } = await query<{
    id: string
  }>(sql`/* lockOwnedCopyrightReplayGroupForExpiryTest */
    SELECT id FROM copyright_replay_retention_groups WHERE id = ${input.groupId} FOR SHARE`)
  if (!groups[0]) {
    await query.commit()
    return false
  }
  await query(sql`/* serializeOwnedCopyrightReplayExpiryMetadata */
    SELECT pg_advisory_xact_lock(hashtextextended('copyright-replay-key-versions', 0))`)
  await query(sql`/* authorizeOwnedCopyrightReplayExpiryTest */ SELECT
    set_config('app.copyright_replay_retention_months', ${String(getCopyrightRetentionWindows().replayMonths)}, true),
    set_config('app.copyright_replay_purge_now', ${input.purgeNow.toISOString()}, true)`)
  try {
    const { rows } = await query<{
      id: string
    }>(sql`/* deleteOwnedCopyrightReplayIdentityAtBoundary */
      DELETE FROM copyright_replay_identities
      WHERE id = ${input.identityId} AND copyright_replay_retention_group_id = ${input.groupId}
      RETURNING id`)
    await query.commit()
    return rows.length === 1
  } catch (err) {
    await query.rollback()
    if ((err as { code?: string }).code === '23514') return false
    throw err
  }
}
