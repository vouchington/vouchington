import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordCopyrightReplayPolicyReviewDue } from '@modules/on-error'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { copyrightConfig, getCopyrightRetentionWindows } from './config.mts'

/** Two raw UUID pages per run; expiry is rechecked after group/identity locks using actual time. */
export async function cleanupCopyrightReplayIdentities() {
  const reviewedAt = copyrightConfig.getFields().replayPolicyReviewedAt
  const reviewed = new Date(typeof reviewedAt === 'string' ? reviewedAt : '')
  const now = new Date()
  const reviewDue =
    !Number.isFinite(reviewed.getTime()) ||
    reviewed > now ||
    shiftUtcCalendarMonths(reviewed, getCopyrightRetentionWindows().replayReviewMonths) <= now
  if (reviewDue) recordCopyrightReplayPolicyReviewDue()
  const size = getCopyrightRetentionWindows().proofPageSize
  const identities = await cleanupPage('identities', size)
  const groups = await cleanupPage('groups', size)
  return {
    reviewDue,
    deleted: identities.deleted,
    groupsDeleted: groups.deleted,
    hasMore: identities.hasMore || groups.hasMore,
  }
}

async function cleanupPage(family: 'identities' | 'groups', size: number) {
  await using query = await beginTransaction()
  await query(sql`/* ensureCopyrightReplayCleanupCursor */ INSERT INTO copyright_replay_cleanup_cursors (family)
    VALUES (${family}) ON CONFLICT DO NOTHING`)
  const { rows: cursors } = await query<{
    cursor_record_id: string | null
  }>(sql`/* lockCopyrightReplayCleanupCursor */
    SELECT cursor_record_id FROM copyright_replay_cleanup_cursors WHERE family = ${family} FOR UPDATE`)
  const cursor = cursors[0]?.cursor_record_id ?? null
  const { rows } =
    family === 'identities'
      ? await query<{
          id: string
        }>(sql`/* pageCopyrightReplayIdentities */ SELECT id FROM copyright_replay_identities
        WHERE (${cursor}::uuid IS NULL OR id > ${cursor}::uuid) ORDER BY id LIMIT ${size + 1}`)
      : await query<{
          id: string
        }>(sql`/* pageCopyrightReplayGroups */ SELECT id FROM copyright_replay_retention_groups
        WHERE (${cursor}::uuid IS NULL OR id > ${cursor}::uuid) ORDER BY id LIMIT ${size + 1}`)
  const ids = rows.slice(0, size).map(row => row.id)
  let deleted = 0
  if (ids.length) {
    if (family === 'identities') {
      // Group precedes key-version metadata and identity, matching authenticated replay.
      const { rows: groups } = await query<{
        id: string
      }>(sql`/* lockExpiredCopyrightReplayGroups */
        SELECT group_row.id FROM copyright_replay_retention_groups group_row
        WHERE group_row.case_purged_at IS NOT NULL AND group_row.id IN (
          SELECT copyright_replay_retention_group_id FROM copyright_replay_identities WHERE id = ANY(${ids}::uuid[]))
        ORDER BY group_row.id FOR SHARE SKIP LOCKED`)
      await query(sql`/* serializeCopyrightReplayKeyVersionCleanup */
        SELECT pg_advisory_xact_lock(hashtextextended('copyright-replay-key-versions', 0))`)
      const now = new Date()
      const months = getCopyrightRetentionWindows().replayMonths
      await query(sql`/* authorizeCopyrightReplayExpiry */ SELECT
        set_config('app.copyright_replay_retention_months', ${String(months)}, true),
        set_config('app.copyright_replay_purge_now', ${now.toISOString()}, true)`)
      const result =
        await query(sql`/* deleteExpiredCopyrightReplayIdentities */ DELETE FROM copyright_replay_identities identity
        WHERE identity.id IN (SELECT candidate.id FROM copyright_replay_identities candidate
          JOIN copyright_replay_retention_groups group_row ON group_row.id = candidate.copyright_replay_retention_group_id
          WHERE candidate.id = ANY(${ids}::uuid[]) AND group_row.id = ANY(${groups.map(row => row.id)}::uuid[])
            AND (((GREATEST(group_row.case_purged_at, candidate.last_replayed_at) AT TIME ZONE 'UTC')
              + make_interval(months => ${months})) AT TIME ZONE 'UTC') <= ${now}
            AND NOT EXISTS (SELECT 1 FROM copyright_notices notice WHERE notice.copyright_replay_retention_group_id = group_row.id)
          ORDER BY candidate.id FOR UPDATE OF candidate SKIP LOCKED)`)
      deleted = result.rowCount ?? 0
    } else {
      const result =
        await query(sql`/* deleteUnreferencedCopyrightReplayGroups */ DELETE FROM copyright_replay_retention_groups group_row
        WHERE group_row.id IN (SELECT candidate.id FROM copyright_replay_retention_groups candidate
          WHERE candidate.id = ANY(${ids}::uuid[]) AND candidate.case_purged_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM copyright_replay_identities identity WHERE identity.copyright_replay_retention_group_id = candidate.id)
            AND NOT EXISTS (SELECT 1 FROM copyright_notices notice WHERE notice.copyright_replay_retention_group_id = candidate.id)
          ORDER BY candidate.id FOR UPDATE SKIP LOCKED)`)
      deleted = result.rowCount ?? 0
    }
  }
  const hasMore = rows.length > size
  await query(sql`/* checkpointCopyrightReplayCleanup */ UPDATE copyright_replay_cleanup_cursors
    SET cursor_record_id = ${hasMore ? ids.at(-1) : null}::uuid WHERE family = ${family}`)
  await query.commit()
  return { deleted, hasMore }
}
