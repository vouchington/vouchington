import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

type PenaltyIdentity = { id: string; reason: string }

export type IntegrityPenaltyLabels = {
  user_username: string | null
  user_display_name: string | null
  creator_username: string | null
  creator_display_name: string | null
  revoker_username: string | null
  revoker_display_name: string | null
  source_flag_type: string | null
}

export async function attachReportIntegrityPenaltyLabels<T extends PenaltyIdentity>(
  penalties: T[],
  query: QueryExecutor = read,
): Promise<Array<T & IntegrityPenaltyLabels>> {
  if (penalties.length === 0) return []
  const ids = penalties.map(penalty => penalty.id)
  const statement = sql`/* attachReportIntegrityPenaltyLabels */
    SELECT p.id,
      target_profile.username AS user_username,
      target_profile.verified_display_name AS user_display_name,
      creator_profile.username AS creator_username,
      creator_profile.verified_display_name AS creator_display_name,
      revoker_profile.username AS revoker_username,
      revoker_profile.verified_display_name AS revoker_display_name,
      flag.flag_type::text AS source_flag_type
    FROM `
  statement.append(sql`report_abuse_penalties`)
  statement.append(sql` p
    LEFT JOIN view_users_public target_profile ON target_profile.id = p.user_id
    LEFT JOIN view_users_public creator_profile ON creator_profile.id = p.created_by_id
    LEFT JOIN view_users_public revoker_profile ON revoker_profile.id = p.revoked_by_id
    LEFT JOIN `)
  statement.append(sql`report_integrity_flags`)
  statement.append(sql` flag ON flag.id = p.source_flag_id
    WHERE p.id = ANY(${ids}::uuid[])
  `)
  const { rows } = await query<{ id: string } & IntegrityPenaltyLabels>(statement)
  const byId = new Map(rows.map(row => [row.id, row]))
  return penalties.map(penalty => ({
    ...penalty,
    user_username: byId.get(penalty.id)?.user_username ?? null,
    user_display_name: byId.get(penalty.id)?.user_display_name ?? null,
    creator_username: byId.get(penalty.id)?.creator_username ?? null,
    creator_display_name: byId.get(penalty.id)?.creator_display_name ?? null,
    revoker_username: byId.get(penalty.id)?.revoker_username ?? null,
    revoker_display_name: byId.get(penalty.id)?.revoker_display_name ?? null,
    source_flag_type: byId.get(penalty.id)?.source_flag_type ?? null,
  }))
}
