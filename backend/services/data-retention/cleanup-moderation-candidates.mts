import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { ModerationCleanupKind } from './cleanup-moderation-kinds.mts'

/** Every branch uses the UUIDv7 primary key for the page and has a fixed SQL identifier. */
export async function getModerationCleanupCandidates(
  kind: ModerationCleanupKind,
  query: QueryExecutor,
  cursorId: string | null,
  upperId: string,
  limit: number,
): Promise<string[]> {
  const after = cursorId ?? '00000000-0000-0000-0000-000000000000'
  let rows: { id: string }[]
  switch (kind) {
    case 'reports':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:reports */
        SELECT id FROM moderation_reports WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'cases':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:cases */
        SELECT id FROM moderation_cases WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'appeals':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:appeals */
        SELECT id FROM moderation_appeals WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'disputes':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:disputes */
        SELECT id FROM review_disputes WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'actions':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:actions */
        SELECT id FROM moderator_actions WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'training_feedbacks':
      ;({ rows } = await query<{
        id: string
      }>(sql`/* moderationCleanupCandidates:trainingFeedbacks */
        SELECT id FROM moderation_training_feedbacks WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'judgements':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:judgements */
        SELECT id FROM moderation_report_judgements WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'integrity_flags':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:integrityFlags */
        SELECT id FROM report_integrity_flags WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'report_penalties':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:reportPenalties */
        SELECT id FROM report_abuse_penalties WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'vote_penalties':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:votePenalties */
        SELECT id FROM vote_weight_penalties WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'warnings':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:warnings */
        SELECT id FROM user_warnings WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'suspensions':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:suspensions */
        SELECT id FROM user_suspensions WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'bans':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:bans */
        SELECT id FROM community_bans WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'notes':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:notes */
        SELECT id FROM user_moderator_notes WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
    case 'applications':
      ;({ rows } = await query<{ id: string }>(sql`/* moderationCleanupCandidates:applications */
        SELECT id FROM community_applications WHERE id > ${after} AND id < ${upperId}
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`))
      break
  }
  return rows.map(row => row.id)
}
