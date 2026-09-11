export type CommunityAiCostTotal = {
  community_id: string
  community_slug: string
  request_count: number
  total_input_tokens: number
  total_output_tokens: number
  unpriced_request_count: number
  total_cost: ScaledMoneyAggregate
}

export type AiCostsResponseBody = {
  results: CommunityAiCostTotal[]
  page_info: PageInfo
}
import type { ScaledMoneyAggregate } from '@ts-shared/money'
import type { PageInfo } from './api-responses'
