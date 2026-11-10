import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type { CurrencyCode, Money } from '@ts-shared/money'
import { parsePostgresMoneyAmount } from '@vouchington/utils/money'
import {
  getTopicDataPointInsightsRowCap,
  getTopicDataPointInsightsWindowYears,
  topicDataPointInsightsConfig,
} from './insights-config.mts'

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

function insightsWindowStart(windowYears: number): Date {
  const start = new Date()
  start.setUTCFullYear(start.getUTCFullYear() - windowYears)
  return start
}

function buildTopicDataPointInsightsQuery(
  topicIds: string[],
  bounds: { minId: string; rowCap: number },
  options?: { vertical?: string },
) {
  // Keep the requested UUID spelling in result keys; compare only UUID-typed ids in SQL.
  // The year window bounds post_data_point_topics.post_id so the (topic_id, post_id)
  // scan can stop. posts.id equals that post_id, so it does not need the same predicate.
  const query = sql`/* getTopicDataPointInsights */
    WITH sample AS (
      SELECT
        requested.topic_id,
        point.post_id,
        point.result,
        point.credit_score_range,
        point.credit_limit_minor_units,
        point.credit_limit_currency
      FROM UNNEST(${topicIds}::text[]) AS requested(topic_id)
      LEFT JOIN LATERAL (
        SELECT
          pdpt.post_id,
          posts.structured_data->>'result' AS result,
          posts.structured_data->>'credit_score_range' AS credit_score_range,
          (posts.structured_data #>> '{credit_limit,amount}')::bigint AS credit_limit_minor_units,
          posts.structured_data #>> '{credit_limit,currency}' AS credit_limit_currency
        FROM post_data_point_topics pdpt
        JOIN posts ON posts.id = pdpt.post_id
        JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)
        WHERE pdpt.topic_id = requested.topic_id::uuid
          AND pdpt.post_id >= ${bounds.minId}
          AND posts.post_type = 'data_point'
          AND `
  query.append(buildPublicPostEligibilityFilter('posts', 'root_post'))

  if (options?.vertical) {
    query.append(sql` AND posts.data_point_vertical = ${options.vertical}`)
  }

  query.append(sql`
        ORDER BY pdpt.post_id DESC
        LIMIT `)
  // A bound LIMIT is invisible to a generic plan. The cap is already a
  // validated DynamicConfig integer, so it is written as a SQL literal.
  query.append(String(bounds.rowCap))
  query.append(sql`
      ) point ON TRUE
    ),
    dist AS (
      SELECT topic_id, credit_score_range, COUNT(*)::int AS cnt
      FROM sample
      WHERE credit_score_range IS NOT NULL
      GROUP BY topic_id, credit_score_range
    ),
    medians AS (
      SELECT
        topic_id,
        credit_limit_currency AS currency_code,
        PERCENTILE_DISC(0.5) WITHIN GROUP (
          ORDER BY credit_limit_minor_units
        )::text AS amount
      FROM sample
      WHERE credit_limit_minor_units IS NOT NULL
        AND credit_limit_currency IS NOT NULL
      GROUP BY topic_id, credit_limit_currency
    )
    SELECT sample.topic_id,
      COUNT(sample.post_id)::int AS total_count,
      COUNT(*) FILTER (WHERE sample.result = 'approved')::int AS approved_count,
      COUNT(*) FILTER (WHERE sample.result = 'denied')::int AS denied_count,
      COUNT(*) FILTER (WHERE sample.result = 'pending')::int AS pending_count,
      (
        SELECT COALESCE(
          JSONB_AGG(
            JSONB_BUILD_OBJECT('currency_code', currency_code, 'amount', amount)
            ORDER BY currency_code
          ),
          '[]'
        )
        FROM medians WHERE medians.topic_id = sample.topic_id
      ) AS median_credit_limits,
      (
        SELECT COALESCE(JSONB_OBJECT_AGG(credit_score_range, cnt), '{}')
        FROM dist WHERE dist.topic_id = sample.topic_id
      ) AS credit_score_distribution
    FROM sample
    GROUP BY sample.topic_id
  `)
  return query
}

export async function getTopicDataPointInsights(
  topicId: string,
  options?: { vertical?: string },
): Promise<TopicDataPointInsights> {
  return (await getTopicDataPointInsightsBatch([topicId], options)).get(topicId)!
}

export async function getTopicDataPointInsightsBatch(
  topicIds: string[],
  options?: { vertical?: string },
): Promise<Map<string, TopicDataPointInsights>> {
  const uniqueIds = [...new Set(topicIds)]
  if (uniqueIds.length === 0) return new Map()
  await topicDataPointInsightsConfig.waitForInitialization()
  const query = buildTopicDataPointInsightsQuery(
    uniqueIds,
    {
      minId: getMinUUIDv7ForDate(insightsWindowStart(getTopicDataPointInsightsWindowYears())),
      rowCap: getTopicDataPointInsightsRowCap(),
    },
    options,
  )
  const { rows } = await read(query.text, query.values)
  return new Map(rows.map(row => [row.topic_id as string, mapTopicDataPointInsights(row)]))
}

function mapTopicDataPointInsights(row: Record<string, unknown>): TopicDataPointInsights {
  const totalCount = Number(row.total_count ?? 0)
  const approvedCount = Number(row.approved_count ?? 0)

  const medianCreditLimits = (
    (row.median_credit_limits ?? []) as {
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
    denied_count: Number(row.denied_count ?? 0),
    pending_count: Number(row.pending_count ?? 0),
    approval_rate: totalCount > 0 ? approvedCount / totalCount : null,
    median_credit_limits: medianCreditLimits,
    credit_score_distribution: (row.credit_score_distribution ?? {}) as CreditScoreDistribution,
  }
}
