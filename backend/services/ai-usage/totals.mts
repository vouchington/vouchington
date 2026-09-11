import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  decodeUuidCursor,
  encodeCursor,
  hasExactKeys,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import { MONEY_SCALE, parsePostgresMoneyAmount, type ScaledMoneyAggregate } from '@ts-shared/money'
import type { PageInfo } from '@voucha/types/pagination'

export type CommunityAiCostTotal = {
  community_id: string
  community_slug: string
  request_count: number
  total_input_tokens: number
  total_output_tokens: number
  unpriced_request_count: number
  total_cost: ScaledMoneyAggregate
}

export type CommunityAiCostTotalsPage = {
  results: CommunityAiCostTotal[]
  page_info: PageInfo
}

type CommunityAiCostTotalCursor = {
  total_cost_microunits: string
  id: string
}

export async function getCommunityAiCostTotals(
  options: { limit?: number; after?: string } = {},
): Promise<CommunityAiCostTotalsPage> {
  const limit = parseBoundedIntegerLimit(options.limit, { default: 25, min: 1, max: 100 })
  const cursor = options.after
    ? decodeUuidCursor(options.after, isCommunityAiCostTotalCursor, 'Invalid AI cost totals cursor')
    : null
  const query = sql`/* getCommunityAiCostTotals */
    SELECT
      c.id AS community_id,
      c.slug AS community_slug,
      COUNT(*)::INT AS request_count,
      COALESCE(SUM(aul.input_tokens), 0)::BIGINT AS total_input_tokens,
      COALESCE(SUM(aul.output_tokens), 0)::BIGINT AS total_output_tokens,
      COUNT(*) FILTER (WHERE aul.pricing_status = 'unpriced')::INT AS unpriced_request_count,
      COALESCE(SUM(aul.cost_microunits), 0)::TEXT AS total_cost_microunits
    FROM ai_usage_records aul
    JOIN communities c ON c.id = aul.community_id
  `
  query.append(sql` GROUP BY c.id, c.slug`)
  if (cursor) {
    query.append(sql`
      HAVING
        COALESCE(SUM(aul.cost_microunits), 0) <
          ${cursor.total_cost_microunits}::NUMERIC
        OR (
          COALESCE(SUM(aul.cost_microunits), 0) =
            ${cursor.total_cost_microunits}::NUMERIC
          AND c.id > ${cursor.id}::UUID
        )
    `)
  }
  query.append(sql`
    ORDER BY COALESCE(SUM(aul.cost_microunits), 0) DESC, c.id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read<{
    community_id: string
    community_slug: string
    request_count: number
    total_input_tokens: string
    total_output_tokens: string
    unpriced_request_count: number
    total_cost_microunits: string
  }>(query)
  const hasNextPage = rows.length > limit
  const pageRows = rows.slice(0, limit)
  const results: CommunityAiCostTotal[] = pageRows.map(row => ({
    community_id: row.community_id,
    community_slug: row.community_slug,
    request_count: row.request_count,
    total_input_tokens: parsePostgresMoneyAmount(row.total_input_tokens),
    total_output_tokens: parsePostgresMoneyAmount(row.total_output_tokens),
    unpriced_request_count: row.unpriced_request_count,
    total_cost: {
      amount: row.total_cost_microunits,
      currency: 'usd' as const,
      scale: MONEY_SCALE,
    },
  }))
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: pageRows[0] ? encodeAiCostTotalCursor(pageRows[0]) : null,
      end_cursor: hasNextPage && pageRows.at(-1) ? encodeAiCostTotalCursor(pageRows.at(-1)!) : null,
    },
  }
}

function isCommunityAiCostTotalCursor(cursor: unknown): cursor is CommunityAiCostTotalCursor {
  return (
    hasExactKeys(cursor, ['total_cost_microunits', 'id']) &&
    typeof cursor.total_cost_microunits === 'string' &&
    isCanonicalNonNegativeIntegerString(cursor.total_cost_microunits) &&
    typeof cursor.id === 'string'
  )
}

function isCanonicalNonNegativeIntegerString(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value)
}

function encodeAiCostTotalCursor(row: {
  community_id: string
  total_cost_microunits: string
}): string {
  return encodeCursor({
    total_cost_microunits: row.total_cost_microunits,
    id: row.community_id,
  })
}
