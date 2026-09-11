import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  EXPOSURE_BREAK_THRESHOLD,
  EXPOSURE_WINDOW_MINUTES,
  EXPOSURE_COOLDOWN_MINUTES,
} from './config.mts'
import type { ExposureState } from './types.mts'

export async function getExposureState(
  moderatorId: string,
  options?: QueryOptions,
): Promise<ExposureState> {
  // Count DISTINCT entity reveals within the rolling window.
  // A reveal of the same post across different surfaces (mod_queue + post_page) counts once.
  // "Entity key" = post_id if set, else report_id, else the row id (anonymous reveal).
  //
  // Cooldown arithmetic is performed entirely in PostgreSQL so the comparison uses the DB
  // clock (now()), avoiding any app-server/DB clock-skew inconsistency.
  const { rows } = await write<{
    distinct_count: string
    threshold_crossed_at: Date | null
    cooldown_ends_at: Date | null
    in_cooldown: boolean | null
  }>(
    sql`/* getExposureState */
    WITH distinct_reveals AS (
      SELECT
        MIN(revealed_at) AS first_revealed_at
      FROM moderation_media_reveals
      WHERE moderator_id = ${moderatorId}
        AND revealed_at >= now() - (${EXPOSURE_WINDOW_MINUTES} * INTERVAL '1 minute')
      GROUP BY COALESCE(post_id::text, report_id::text, id::text)
    ),
    total AS (
      SELECT COUNT(*)::int AS distinct_count FROM distinct_reveals
    ),
    threshold_row AS (
      SELECT ranked_threshold.threshold_crossed_at
      FROM (
        SELECT
          first_revealed_at AS threshold_crossed_at,
          ROW_NUMBER() OVER (ORDER BY first_revealed_at ASC) AS reveal_rn
        FROM distinct_reveals
      ) ranked_threshold
      WHERE ranked_threshold.reveal_rn = ${EXPOSURE_BREAK_THRESHOLD}
    )
    SELECT
      t.distinct_count,
      tr.threshold_crossed_at,
      (tr.threshold_crossed_at + (${EXPOSURE_COOLDOWN_MINUTES} * INTERVAL '1 minute')) AS cooldown_ends_at,
      (now() < tr.threshold_crossed_at + (${EXPOSURE_COOLDOWN_MINUTES} * INTERVAL '1 minute')) AS in_cooldown
    FROM total t
    LEFT JOIN threshold_row tr ON true
  `,
    options,
  )

  const count = parseInt(rows[0]?.distinct_count ?? '0', 10)
  const inCooldown = rows[0]?.in_cooldown ?? false
  const cooldownEndsAt = rows[0]?.cooldown_ends_at ?? null

  return {
    count,
    threshold: EXPOSURE_BREAK_THRESHOLD,
    in_cooldown: inCooldown,
    cooldown_ends_at: inCooldown && cooldownEndsAt ? cooldownEndsAt.toISOString() : null,
  }
}
