import type { PageInfo } from '@voucha/types/pagination'

export type TrendingReferralProgramOptions = {
  limit: number
  after?: string
}

export type TrendingReferralProgram = {
  id: string
  trending_score: number
  link_count: number
}

export type TrendingReferralProgramsResult = {
  referral_programs: TrendingReferralProgram[]
  page_info: PageInfo
}
