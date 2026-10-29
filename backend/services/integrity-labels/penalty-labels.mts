import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { attachIntegrityLabelRows } from './attach-label-rows.mts'

type PenaltyDomain = 'report' | 'vote'
type PenaltyIdentity = { id: string }

export type IntegrityPenaltyLabels = {
  user_username: string | null
  user_display_name: string | null
  creator_username: string | null
  creator_display_name: string | null
  revoker_username: string | null
  revoker_display_name: string | null
  source_flag_type: string | null
}

type PenaltyLabelRow = { id: string } & IntegrityPenaltyLabels

/** The table pair is a closed domain choice; callers cannot supply SQL identifiers. */
export function attachIntegrityPenaltyLabels<T extends PenaltyIdentity>(
  domain: PenaltyDomain,
  penalties: T[],
  query: QueryExecutor = read,
): Promise<Array<T & IntegrityPenaltyLabels>> {
  return attachIntegrityLabelRows<T, PenaltyLabelRow, IntegrityPenaltyLabels>(
    penalties,
    ids => {
      const statement = sql`/* attachIntegrityPenaltyLabels */
        SELECT p.id,
          target_profile.username AS user_username,
          target_profile.verified_display_name AS user_display_name,
          creator_profile.username AS creator_username,
          creator_profile.verified_display_name AS creator_display_name,
          revoker_profile.username AS revoker_username,
          revoker_profile.verified_display_name AS revoker_display_name,
          flag.flag_type::text AS source_flag_type
        FROM `
      statement.append(
        domain === 'report' ? sql`report_abuse_penalties` : sql`vote_weight_penalties`,
      )
      statement.append(sql` p
        LEFT JOIN view_users_public target_profile ON target_profile.id = p.user_id
        LEFT JOIN view_users_public creator_profile ON creator_profile.id = p.created_by_id
        LEFT JOIN view_users_public revoker_profile ON revoker_profile.id = p.revoked_by_id
        LEFT JOIN `)
      statement.append(
        domain === 'report' ? sql`report_integrity_flags` : sql`vote_integrity_flags`,
      )
      statement.append(sql` flag ON flag.id = p.source_flag_id
        WHERE p.id = ANY(${ids}::uuid[])
      `)
      return statement
    },
    fact => ({
      user_username: fact?.user_username ?? null,
      user_display_name: fact?.user_display_name ?? null,
      creator_username: fact?.creator_username ?? null,
      creator_display_name: fact?.creator_display_name ?? null,
      revoker_username: fact?.revoker_username ?? null,
      revoker_display_name: fact?.revoker_display_name ?? null,
      source_flag_type: fact?.source_flag_type ?? null,
    }),
    query,
  )
}
