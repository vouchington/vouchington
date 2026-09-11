import type { PageInfo } from '@voucha/types/pagination'
import type { ScaledMoney } from '@ts-shared/money'

export type RewardsProgramPointValuationTopic = {
  id: string
  name: string
  slug: string
}

export type IndividualRewardsProgramPointValuation = {
  id: string
  rewards_program_id: string
  value_per_point: ScaledMoney
  note: string | null
  rewards_program: RewardsProgramPointValuationTopic
}

export type IndividualRewardsProgramPointValuationPage = {
  results: IndividualRewardsProgramPointValuation[]
  page_info: PageInfo
}

export type GetIndividualRewardsProgramPointValuationsOptions = {
  after?: string
  limit?: number
}
