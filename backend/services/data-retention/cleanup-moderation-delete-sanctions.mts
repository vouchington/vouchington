import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ModerationCleanupKind } from './cleanup-moderation-kinds.mts'

/** Active suspensions, bans, and penalties remain until their lifecycle ends; warnings have their own retention window. */
export async function deleteExpiredModerationSanctions(
  kind: ModerationCleanupKind,
  query: QueryExecutor,
  ids: string[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0
  const thirtyDaysAgo = daysBefore(now, 30)
  let rowCount: number | null
  switch (kind) {
    case 'integrity_flags':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:integrityFlags */
        DELETE FROM report_integrity_flags flag
        WHERE flag.id = ANY(${ids}::uuid[])
          AND flag.resolved_at < ${now}::timestamptz - interval '180 days'
      `))
      break
    case 'report_penalties':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:reportPenalties */
        DELETE FROM report_abuse_penalties penalty
        WHERE penalty.id = ANY(${ids}::uuid[])
          AND penalty.revoked_at < ${now}::timestamptz - interval '180 days'
      `))
      break
    case 'vote_penalties':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:votePenalties */
        DELETE FROM vote_weight_penalties penalty
        WHERE penalty.id = ANY(${ids}::uuid[])
          AND penalty.revoked_at < ${now}::timestamptz - interval '180 days'
      `))
      break
    case 'warnings':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:warnings */
        DELETE FROM user_warnings warning
        WHERE warning.id = ANY(${ids}::uuid[])
          AND (warning.id < fn_min_uuidv7(${now}::timestamptz - interval '12 months')
            OR warning.revoked_at < ${now}::timestamptz - interval '90 days')
          AND NOT EXISTS (
            SELECT 1 FROM moderation_appeals appeal WHERE appeal.user_warning_id = warning.id
          )
      `))
      break
    case 'suspensions':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:suspensions */
        DELETE FROM user_suspensions suspension
        WHERE suspension.id = ANY(${ids}::uuid[])
          AND suspension.lifted_at < ${now}::timestamptz - interval '12 months'
          AND NOT EXISTS (
            SELECT 1 FROM moderation_appeals appeal WHERE appeal.user_suspension_id = suspension.id
          )
      `))
      break
    case 'bans':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:bans */
        DELETE FROM community_bans ban
        WHERE ban.id = ANY(${ids}::uuid[])
          AND COALESCE(ban.lifted_at, ban.expires_at) < ${now}::timestamptz - interval '12 months'
          AND NOT EXISTS (
            SELECT 1 FROM moderation_appeals appeal WHERE appeal.community_ban_id = ban.id
          )
      `))
      break
    case 'notes':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:notes */
        DELETE FROM user_moderator_notes note
        WHERE note.id = ANY(${ids}::uuid[])
          AND note.deleted_at < ${thirtyDaysAgo}
      `))
      break
    case 'applications':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationSanctions:applications */
        DELETE FROM community_applications application
        WHERE application.id = ANY(${ids}::uuid[])
          AND COALESCE(application.approved_at, application.rejected_at) < ${now}::timestamptz - interval '12 months'
      `))
      break
    default:
      throw new Error(`Not a moderation sanction cleanup kind: ${kind}`)
  }
  return rowCount ?? 0
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000)
}
