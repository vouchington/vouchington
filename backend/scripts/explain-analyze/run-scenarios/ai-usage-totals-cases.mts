import { encodeCursor } from '@modules/pagination'
import { getPaginationLimits } from '@services/pagination'
import {
  AI_USAGE_TOTAL_CALLS_PER_COMMUNITY,
  AI_USAGE_TOTAL_MONTHLY_CALLS,
  aiUsageTotalsCommunityId,
  aiUsageTotalsUnitCost,
} from '../seed-data/ai-usage-totals.mts'

/** The externally encoded cost/id cursor keeps its shape; the tie-breaker now walks id descending. */
export function aiUsageTotalsReadCases() {
  const limits = getPaginationLimits(25, 100)
  const cursor = (index: number) =>
    encodeCursor({
      total_cost_microunits: String(
        (aiUsageTotalsUnitCost(index) ?? 0) *
          (AI_USAGE_TOTAL_CALLS_PER_COMMUNITY + AI_USAGE_TOTAL_MONTHLY_CALLS),
      ),
      id: aiUsageTotalsCommunityId(index),
    })
  return [
    { id: 'ai-usage-totals-first', options: {}, limit: limits.default },
    {
      id: 'ai-usage-totals-forward',
      options: { limit: limits.max, after: cursor(750) },
      limit: limits.max,
    },
    {
      id: 'ai-usage-totals-zero-cost',
      options: { limit: limits.max, after: cursor(999) },
      limit: limits.max,
    },
  ] as const
}
