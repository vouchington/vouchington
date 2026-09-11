import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ContributionPolicy } from './policy.mts'

type ContributionCapacityStatusRow = {
  allowed: boolean
  reason: string | null
  retry_after_seconds: string | null
}

export async function queryContributionAdmissionCapacityStatus(
  actorId: string,
  source: string,
  policy: ContributionPolicy,
) {
  return write<ContributionCapacityStatusRow>(sql`/* queryContributionAdmissionCapacityStatus */
    WITH observed_at AS (
      SELECT clock_timestamp() AS value
    ), windows (reason, scoped_source, consumption_mode, capacity_limit, window_seconds) AS (
      VALUES
        ('global_limit'::text, NULL::text, 'all_windows'::text, ${policy.global.short.limit}::integer, ${policy.global.short.windowSeconds}::integer),
        ('global_limit'::text, NULL::text, NULL::text, ${policy.global.daily.limit}::integer, ${policy.global.daily.windowSeconds}::integer),
        ('type_limit'::text, ${source}::text, 'all_windows'::text, ${policy.type.short.limit}::integer, ${policy.type.short.windowSeconds}::integer),
        ('type_limit'::text, ${source}::text, NULL::text, ${policy.type.daily.limit}::integer, ${policy.type.daily.windowSeconds}::integer)
    ), actor_consumptions AS MATERIALIZED (
      SELECT committed_at, reservation_id, source, consumption_mode
      FROM post_admission_quota_consumptions
      CROSS JOIN observed_at
      WHERE actor_id = ${actorId}
        AND committed_at >= observed_at.value - (
          (SELECT MAX(window_seconds) FROM windows WHERE capacity_limit <> -1) * INTERVAL '1 second'
        )
    ), exhausted AS (
      SELECT windows.reason, windows.window_seconds, capacity.retry_at, observed_at.value AS observed_at
      FROM windows
      CROSS JOIN observed_at
      CROSS JOIN LATERAL (
        WITH matching AS MATERIALIZED (
          SELECT committed_at, reservation_id
          FROM actor_consumptions
          WHERE committed_at >= observed_at.value - (windows.window_seconds * INTERVAL '1 second')
            AND (windows.scoped_source IS NULL OR source = windows.scoped_source)
            AND (windows.consumption_mode IS NULL OR consumption_mode = windows.consumption_mode)
        )
        SELECT COUNT(*) AS used,
          CASE WHEN COUNT(*) >= windows.capacity_limit THEN (
            SELECT committed_at
            FROM (
              SELECT committed_at, reservation_id
              FROM matching
              ORDER BY committed_at DESC, reservation_id DESC
              LIMIT windows.capacity_limit
            ) latest_within_limit
            ORDER BY committed_at, reservation_id
            LIMIT 1
          ) END AS retry_at
        FROM matching
      ) capacity
      WHERE windows.capacity_limit <> -1 AND capacity.used >= windows.capacity_limit
    )
    SELECT NOT EXISTS (SELECT 1 FROM exhausted) AS allowed,
      (SELECT reason FROM exhausted ORDER BY reason = 'type_limit' DESC LIMIT 1) AS reason,
      (
        SELECT MAX(
          GREATEST(
            1,
            CEIL(EXTRACT(EPOCH FROM retry_at + (window_seconds * INTERVAL '1 second') - observed_at))
          )
        )::integer::text
        FROM exhausted
      ) AS retry_after_seconds`)
}
