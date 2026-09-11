import { encodeCursor } from '@modules/pagination'
import type { ApiFixtureCase } from './types.mts'

const consumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const
const route = { routeTemplate: '/api/v1/admin/ai-costs' } as const
const migratedFrom = [
  'backend/api/v1/admin/ai-costs/ai-costs.mts',
  'backend/services/ai-usage/totals.mts',
]
const firstPageCursor = aiCostCursor(
  '900719925474099312345678',
  '00000000-0000-7000-8000-000000000102',
)

export const nativeAiCostApiFixtureCases: ApiFixtureCase[] = [
  aiCostCase(
    'native.admin-ai-costs.default',
    undefined,
    [
      aiCostTotal(
        '101',
        'alpha-community',
        987_654,
        9_876_543_210,
        7_654_321_098,
        42,
        '1234567890123456789012345',
      ),
      aiCostTotal(
        '102',
        'beta-community',
        123_456,
        4_294_967_296,
        3_221_225_472,
        7,
        '900719925474099312345678',
      ),
    ],
    true,
    firstPageCursor,
  ),
  aiCostCase(
    'native.admin-ai-costs.page-2',
    firstPageCursor,
    [
      aiCostTotal(
        '103',
        'gamma-community',
        12,
        8_589_934_592,
        5_368_709_120,
        0,
        '3141592653589793',
      ),
    ],
    false,
    null,
  ),
  aiCostCase('native.admin-ai-costs.empty', undefined, [], false, null),
]

function aiCostCase(
  id: string,
  after: string | undefined,
  results: ReturnType<typeof aiCostTotal>[],
  hasNextPage: boolean,
  endCursor: string | null,
): ApiFixtureCase {
  return {
    id,
    method: 'GET',
    path: '/api/v1/admin/ai-costs',
    route,
    query: { ...(after ? { after } : {}), limit: '25' },
    auth: 'fixture-admin',
    status: 200,
    consumers: [...consumers],
    migratedFrom,
    body: {
      results,
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: results[0]
          ? aiCostCursor(results[0].total_cost.amount, results[0].community_id)
          : null,
        end_cursor: endCursor,
      },
    },
  }
}

function aiCostTotal(
  communityIdSuffix: string,
  communitySlug: string,
  requestCount: number,
  totalInputTokens: number,
  totalOutputTokens: number,
  unpricedRequestCount: number,
  totalCostAmount: string,
) {
  return {
    community_id: `00000000-0000-7000-8000-000000000${communityIdSuffix}`,
    community_slug: communitySlug,
    request_count: requestCount,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    unpriced_request_count: unpricedRequestCount,
    total_cost: { amount: totalCostAmount, currency: 'usd', scale: 6 },
  }
}

function aiCostCursor(totalCostMicrounits: string, id: string): string {
  return encodeCursor({ total_cost_microunits: totalCostMicrounits, id })
}
