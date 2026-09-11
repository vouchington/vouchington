import type { PageInfo } from '@voucha/types/pagination'

export type RewardsProgramStatusTopic = {
  id: string
  name: string
  slug: string
}

export type IndividualRewardsProgramStatus = {
  id: string
  rewards_program_status_id: string
  since: string | null
  until: string | null
  rewards_program_status: RewardsProgramStatusTopic
}

export type IndividualRewardsProgramStatusPage = {
  results: IndividualRewardsProgramStatus[]
  page_info: PageInfo
}

export type GetIndividualRewardsProgramStatusesOptions = {
  after?: string
  limit?: number
}
