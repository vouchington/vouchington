import type { TransactionQuery } from '@data-stores/psql/types'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'
import {
  selectTerritorialPosterDelivery,
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

export function territorialPosterCursorScope(noticeId: string, decisionId: string): string {
  return `copyright-territorial-posters:${noticeId}:${decisionId}:target-asc`
}

/**
 * One page of the notice's targets, ordered by target id, with the posters to notify for each.
 * The parties are computed only for the page's targets, and delivery once per (target, poster)
 * pair on the page. Pass the last returned target id as `afterTargetId` to continue. `limit` counts
 * targets, so a page holds a row per target and poster.
 */
export async function selectTerritorialStaffPosters(
  decision: { noticeId: string; decisionId: string; decidedAt: Date },
  query: TransactionQuery,
  options: { limit: number; afterTargetId?: string },
): Promise<{ results: CopyrightTerritorialStaffPoster[]; hasNextPage: boolean }> {
  // The decision check does not depend on the target, so it runs once and a stale decision stops
  // before any target is read.
  const targetsSql = sql`/* selectTerritorialStaffPosterTargets */
    WITH live AS MATERIALIZED (
      SELECT notice.id FROM copyright_notices notice
      WHERE notice.id = ${decision.noticeId}
        AND notice.current_territorial_decision_identity_id = ${decision.decisionId}
        AND notice.territorial_decision_outcome = 'restrict'
    )
    SELECT target.id FROM copyright_notice_targets target
    WHERE target.copyright_notice_id = ${decision.noticeId}
      AND EXISTS (SELECT 1 FROM live)`
  if (options.afterTargetId) targetsSql.append(sql` AND target.id > ${options.afterTargetId}`)
  targetsSql.append(sql` ORDER BY target.id LIMIT ${options.limit + 1}`)
  const { rows: targetRows } = await query<{ id: string }>(targetsSql)
  const hasNextPage = targetRows.length > options.limit
  const targetIds = targetRows.slice(0, options.limit).map(row => row.id)
  if (targetIds.length === 0) return { results: [], hasNextPage: false }

  const partiesSql = sql`/* selectTerritorialStaffPosterParties */
    SELECT target.id AS target_id, party.user_id
    FROM copyright_notice_targets target
    LEFT JOIN LATERAL `
  partiesSql.append(copyrightPlacementPartiesSql('notify'))
  partiesSql.append(sql` party ON true
    WHERE target.copyright_notice_id = ${decision.noticeId}
      AND target.id = ANY(${targetIds}::uuid[])
    ORDER BY target.id, party.user_id`)
  // no-mistakes-disable-next-line postgres-bounded-statements: The placement roots are reached only through the page's targets, which `target.id = ANY(targetIds)` limits to at most `options.limit` ids of one notice. `image_placements` and `image_surface_placements` are keyed by `placement_id` and activations by `(placement_id, placement_revision)`, and the community owner arm is off for `notify`, so each target adds at most a few rows.
  const { rows } = await query<{ target_id: string; user_id: string | null }>(partiesSql)
  const delivery = await selectTerritorialPosterDelivery(
    decision.noticeId,
    decision.decidedAt,
    rows.flatMap(row => (row.user_id ? [{ targetId: row.target_id, userId: row.user_id }] : [])),
    query,
  )
  return {
    results: rows.map(row => {
      const reached = row.user_id ? delivery.get(row.target_id)?.get(row.user_id) : undefined
      return {
        target_id: row.target_id,
        user_id: row.user_id,
        informed_at: reached?.informed_at ?? null,
        state: reached?.state ?? null,
      }
    }),
    hasNextPage,
  }
}
