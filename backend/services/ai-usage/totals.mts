import { getPaginationLimits } from '@services/pagination'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  decodeUuidCursor,
  encodeCursor,
  hasExactKeys,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import { MONEY_SCALE, type ScaledMoneyAggregate } from '@ts-shared/money'
import { parsePostgresMoneyAmount } from '@vouchington/utils/money'
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
  const limit = parseBoundedIntegerLimit(options.limit, { min: 1, ...getPaginationLimits(25, 100) })
  const cursor = options.after
    ? decodeUuidCursor(options.after, isCommunityAiCostTotalCursor, 'Invalid AI cost totals cursor')
    : null
  // Totals are materialized, so they lag the ledger by up to one refresh. The ranking index walks
  // (cost DESC, community_id DESC); the join to communities applies live eligibility per page row.
  const query = sql`/* getCommunityAiCostTotals */
    SELECT
      c.id AS community_id,
      c.slug AS community_slug,
      totals.request_count::text AS request_count,
      totals.input_tokens::text AS total_input_tokens,
      totals.output_tokens::text AS total_output_tokens,
      totals.unpriced_request_count::text AS unpriced_request_count,
      totals.cost_microunits::text AS total_cost_microunits
    FROM mv_ai_usage_community_totals totals
    JOIN communities c ON c.id = totals.community_id AND c.deleted_at IS NULL
  `
  if (cursor) {
    query.append(sql`
      WHERE (totals.cost_microunits, totals.community_id) <
        (${cursor.total_cost_microunits}::NUMERIC, ${cursor.id}::UUID)
    `)
  }
  query.append(sql`
    ORDER BY totals.cost_microunits DESC, totals.community_id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read<{
    community_id: string
    community_slug: string
    request_count: string
    total_input_tokens: string
    total_output_tokens: string
    unpriced_request_count: string
    total_cost_microunits: string
  }>(query)
  const hasNextPage = rows.length > limit
  const pageRows = rows.slice(0, limit)
  const results: CommunityAiCostTotal[] = pageRows.map(row => ({
    community_id: row.community_id,
    community_slug: row.community_slug,
    request_count: parsePostgresMoneyAmount(row.request_count),
    total_input_tokens: parsePostgresMoneyAmount(row.total_input_tokens),
    total_output_tokens: parsePostgresMoneyAmount(row.total_output_tokens),
    unpriced_request_count: parsePostgresMoneyAmount(row.unpriced_request_count),
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
