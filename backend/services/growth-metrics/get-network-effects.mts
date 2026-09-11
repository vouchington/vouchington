import { read } from '@data-stores/psql'
import { query } from '@data-stores/analytics'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import type { GrowthRange, NetworkEffects } from './types.mts'

export async function getNetworkEffects(
  _range: GrowthRange,
  periodStart: Date,
): Promise<NetworkEffects> {
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)

  const [{ rows }, lpVisitRows] = await Promise.all([
    read(sql`/* getNetworkEffects */
      WITH referral_summary AS (
        SELECT
          COUNT(*)::INT AS attributions,
          COUNT(DISTINCT referrer_id)::INT AS unique_links
        FROM session_referral_attributions
        WHERE id > ${periodStartUuid} AND referrer_id IS NOT NULL
      ),
      topic_coverage AS (
        SELECT
          COUNT(*) FILTER (WHERE
            (COALESCE(tm.ratings__count__1, 0) + COALESCE(tm.ratings__count__2, 0) +
             COALESCE(tm.ratings__count__3, 0) + COALESCE(tm.ratings__count__4, 0) +
             COALESCE(tm.ratings__count__5, 0)) >= 5
          )::INT AS covered,
          COUNT(*)::INT AS total
        FROM topic_metrics tm
        JOIN topics t ON t.id = tm.topic_id
        WHERE t.deleted_at IS NULL
          AND t.merged_into_topic_id IS NULL
      ),
      new_users_in_period AS (
        SELECT COUNT(*)::INT AS cnt
        FROM users
        WHERE deleted_at IS NULL AND id > ${periodStartUuid}
      )
      SELECT
        (SELECT attributions FROM referral_summary) AS referral_attributions,
        (SELECT unique_links FROM referral_summary) AS referral_unique_links,
        (SELECT covered FROM topic_coverage) AS topics_covered,
        (SELECT total FROM topic_coverage) AS topics_total,
        (SELECT cnt FROM new_users_in_period) AS new_users
    `),
    query<{ cnt: number }>(
      `SELECT COUNT(*)::INT AS cnt FROM web_page_view WHERE page_kind = 'landing_page' AND event_time >= TIMESTAMP '${periodStart.toISOString()}'`,
    ),
  ])

  const row = rows[0]!
  const referralAttributions = (row.referral_attributions as number) ?? 0
  const referralUniqueLinks = (row.referral_unique_links as number) ?? 0
  const topicsCovered = (row.topics_covered as number) ?? 0
  const topicsTotal = (row.topics_total as number) ?? 0
  const lpVisits = lpVisitRows[0]?.cnt ?? 0
  const newUsers = (row.new_users as number) ?? 0

  // Referral coefficient: attributions per unique referral link
  const referralCoefficient =
    referralUniqueLinks > 0 ? referralAttributions / referralUniqueLinks : 0

  return {
    referral_coefficient: referralCoefficient,
    topic_coverage_rate: topicsTotal > 0 ? topicsCovered / topicsTotal : 0,
    landing_page_visits: lpVisits,
    new_signups: newUsers,
    signup_visit_ratio: lpVisits > 0 ? newUsers / lpVisits : 0,
  }
}
