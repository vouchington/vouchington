import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import { parsePostgresMoneyAmount, type CurrencyCode, type Money } from '@ts-shared/money'

export type CreditScoreDistribution = Record<string, number>

export type TopicDataPointInsights = {
  total_count: number
  approved_count: number
  denied_count: number
  pending_count: number
  approval_rate: number | null
  median_credit_limits: Money[]
  credit_score_distribution: CreditScoreDistribution
}

export async function getTopicDataPointInsights(
  topicId: string,
  options?: { vertical?: string },
): Promise<TopicDataPointInsights> {
  const query = sql`/* getTopicDataPointInsights */
    WITH base AS (
      SELECT
        posts.structured_data->>'result' AS result,
        posts.structured_data->>'credit_score_range' AS credit_score_range,
        (posts.structured_data #>> '{credit_limit,amount}')::bigint AS credit_limit_minor_units,
        posts.structured_data #>> '{credit_limit,currency}' AS credit_limit_currency
      FROM posts
      JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
      JOIN post_data_point_topics pdpt ON pdpt.post_id = posts.id AND pdpt.topic_id = ${topicId}
      WHERE posts.post_type = 'data_point'
        AND `
  query.append(buildPublicPostEligibilityFilter('posts', 'root_post'))

  if (options?.vertical) {
    query.append(sql` AND posts.data_point_vertical = ${options.vertical}`)
  }

  query.append(sql`
    ),
    dist AS (
      SELECT credit_score_range, COUNT(*)::int AS cnt
      FROM base
      WHERE credit_score_range IS NOT NULL
      GROUP BY credit_score_range
    ),
    medians AS (
      SELECT
        credit_limit_currency AS currency_code,
        PERCENTILE_DISC(0.5) WITHIN GROUP (
          ORDER BY credit_limit_minor_units
        )::text AS amount
      FROM base
      WHERE credit_limit_minor_units IS NOT NULL
        AND credit_limit_currency IS NOT NULL
      GROUP BY credit_limit_currency
    )
    SELECT
      COUNT(*)::int AS total_count,
      COUNT(*) FILTER (WHERE result = 'approved')::int AS approved_count,
      COUNT(*) FILTER (WHERE result = 'denied')::int AS denied_count,
      COUNT(*) FILTER (WHERE result = 'pending')::int AS pending_count,
      (
        SELECT COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT('currency_code', currency_code, 'amount', amount)
            ORDER BY currency_code
          ),
          '[]'
        )
        FROM medians
      ) AS median_credit_limits,
      (SELECT COALESCE(JSONB_OBJECT_AGG(credit_score_range, cnt), '{}') FROM dist)
        AS credit_score_distribution
    FROM base
  `)

  const { rows } = await read(query)
  const row = rows[0]

  const totalCount = Number(row?.total_count ?? 0)
  const approvedCount = Number(row?.approved_count ?? 0)

  const medianCreditLimits = (
    (row?.median_credit_limits ?? []) as {
      currency_code: CurrencyCode
      amount: string
    }[]
  ).map(median => ({
    amount: parsePostgresMoneyAmount(median.amount),
    currency: median.currency_code,
  }))

  return {
    total_count: totalCount,
    approved_count: approvedCount,
    denied_count: Number(row?.denied_count ?? 0),
    pending_count: Number(row?.pending_count ?? 0),
    approval_rate: totalCount > 0 ? approvedCount / totalCount : null,
    median_credit_limits: medianCreditLimits,
    credit_score_distribution: (row?.credit_score_distribution ?? {}) as CreditScoreDistribution,
  }
}
