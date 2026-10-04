import { getPaginationLimitsForContract } from '@services/pagination'
import { getGrowthMetrics } from '@services/growth-metrics'
import { parseGrowthMetricsRange } from '@services/growth-metrics/parse-range'
import { getCommunityAiCostTotals } from '@services/ai-usage'
import { aiCostTotalsParser } from '@services/ai-usage/query-parser'
import { getManagedQueueStats } from '@services/queue-monitoring'
import { adminInput, createAdminTool, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const growthApi = { method: 'GET', path: '/api/v1/growth-metrics' } as const
const growth = createAdminTool<{ range?: string }>({
  name: 'get_growth_metrics',
  description: 'Read platform growth metrics. Range defaults to 30 days.',
  scope: 'analytics:read',
  api: growthApi,
  parameters: adminInput({ range: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'] } }),
  outputSchema: adminRouteOutputSchema(growthApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (_, args) => getGrowthMetrics(parseGrowthMetricsRange(args.range)),
})
const costsApi = { method: 'GET', path: '/api/v1/admin/ai-costs' } as const
const costs = createAdminTool<{ after?: string; limit?: number }>({
  name: 'get_ai_costs',
  description: 'Read a bounded, paginated page of community AI costs.',
  scope: 'analytics:read',
  api: costsApi,
  parameters: adminInput(PAGE_INPUT),
  outputSchema: adminRouteOutputSchema(costsApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (_, args) =>
    getCommunityAiCostTotals(
      aiCostTotalsParser.parse(
        args,
        getPaginationLimitsForContract(aiCostTotalsParser.queryContract),
      ),
    ),
})
const statsApi = { method: 'GET', path: '/api/v1/mq/stats' } as const
const stats = createAdminTool<Record<string, never>>({
  name: 'get_queue_stats',
  description: 'Read aggregate statistics for all managed queues.',
  scope: 'analytics:read',
  api: statsApi,
  parameters: adminInput({}),
  outputSchema: adminRouteOutputSchema(statsApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: user => getManagedQueueStats(user),
})
export const adminBusinessAnalyticsTools = [growth, costs, stats]
