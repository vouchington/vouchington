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
        ('global_limit'::text, NULL::contribution_policy_sources, 'all_windows'::post_admission_quota_consumption_modes, ${policy.global.short.limit}::integer, ${policy.global.short.windowSeconds}::integer),
        ('global_limit'::text, NULL::contribution_policy_sources, NULL::post_admission_quota_consumption_modes, ${policy.global.daily.limit}::integer, ${policy.global.daily.windowSeconds}::integer),
        ('type_limit'::text, ${source}::contribution_policy_sources, 'all_windows'::post_admission_quota_consumption_modes, ${policy.type.short.limit}::integer, ${policy.type.short.windowSeconds}::integer),
        ('type_limit'::text, ${source}::contribution_policy_sources, NULL::post_admission_quota_consumption_modes, ${policy.type.daily.limit}::integer, ${policy.type.daily.windowSeconds}::integer)
    ), exhausted AS (
      SELECT windows.reason, windows.window_seconds, capacity.retry_at, observed_at.value AS observed_at
      FROM windows
      CROSS JOIN observed_at
      CROSS JOIN LATERAL (
        SELECT COUNT(*) AS used, MIN(committed_at) AS retry_at
        FROM (
          SELECT committed_at
          FROM post_admission_quota_consumptions
          WHERE actor_user_id = ${actorId}
            AND committed_at >= observed_at.value - (windows.window_seconds * INTERVAL '1 second')
            AND (windows.scoped_source IS NULL OR source = windows.scoped_source)
            AND (windows.consumption_mode IS NULL OR consumption_mode = windows.consumption_mode)
          ORDER BY committed_at DESC, reservation_id DESC
          LIMIT GREATEST(windows.capacity_limit, 0)
        ) latest_within_limit
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
