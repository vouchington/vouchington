import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'
import {
  territorialDeliverySql,
  type TerritorialDeliveryState,
} from './read-models-staff-territorial-delivery.mts'

/** One poster notified for one target; a poster on several targets has a row per target. */
export type CopyrightTerritorialStaffPoster = {
  target_id: string
  /** Null when no account can be notified for the target. */
  user_id: string | null
  informed_at: Date | null
  state: TerritorialDeliveryState | null
}

type PosterRow = CopyrightTerritorialStaffPoster & { has_next_page: boolean }

export function territorialPosterCursorScope(noticeId: string, decisionId: string): string {
  return `copyright-territorial-posters:${noticeId}:${decisionId}:target-asc`
}

/**
 * One page of the notice's targets, ordered by target id, with the posters to notify for each.
 * The parties are computed only for the page's targets. Pass the last returned target id as
 * `afterTargetId` to continue. `limit` counts targets, so a page holds a row per target and poster.
 */
export async function selectTerritorialStaffPosters(
  decision: { noticeId: string; decisionId: string; decidedAt: Date },
  query: TransactionQuery,
  options: { limit: number; afterTargetId?: string },
): Promise<{ results: CopyrightTerritorialStaffPoster[]; hasNextPage: boolean }> {
  const statement = sql`/* selectTerritorialStaffPosters */
    WITH candidates AS (
      SELECT target.id, target.copyright_notice_id, target.placement_id,
        target.surface_activation_revision, target.surface_owner_user_id
      FROM copyright_notice_targets target
      WHERE target.copyright_notice_id = ${decision.noticeId}
        AND EXISTS (SELECT 1 FROM copyright_notices notice
          WHERE notice.id = target.copyright_notice_id
            AND notice.current_territorial_decision_identity_id = ${decision.decisionId}
            AND notice.territorial_decision_outcome = 'restrict')`
  if (options.afterTargetId) statement.append(sql` AND target.id > ${options.afterTargetId}`)
  statement.append(sql`
      ORDER BY target.id
      LIMIT ${options.limit + 1}
    ), source AS (
      SELECT * FROM candidates ORDER BY id LIMIT ${options.limit}
    )
    SELECT target.id AS target_id, party.user_id, delivery.informed_at, delivery.state,
      (SELECT count(*) FROM candidates) > ${options.limit} AS has_next_page
    FROM source target
    LEFT JOIN LATERAL `)
  statement.append(copyrightPlacementPartiesSql('notify'))
  statement.append(sql` party ON true
    `)
  statement.append(territorialDeliverySql('poster', decision.decidedAt))
  statement.append(sql`
    ORDER BY target.id, party.user_id
  `)
  const { rows } = await query<PosterRow>(statement)
  return {
    results: rows.map(({ has_next_page: _hasNext, ...poster }) => poster),
    hasNextPage: rows[0]?.has_next_page ?? false,
  }
}
