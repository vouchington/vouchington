import { cache } from 'react'
import { serverApi } from './instance'
import type { AiCostsResponseBody } from '@/types/ai-costs'

export const getAiCostTotals = cache(
  async (options?: { after?: string; limit?: number }): Promise<AiCostsResponseBody> =>
    serverApi.get<AiCostsResponseBody>('/api/v1/admin/ai-costs', {
      searchParams: { after: options?.after, limit: options?.limit },
    }),
)
