import type { BlueskyAccountInfo, OAuthAccountInfo } from './user'
import type { PageInfo } from './api-responses'
import type { CurrencyCode, Money, MoneyRange, ScaledMoney } from '@ts-shared/money'

export type { AuthorizedUserOfCardSummary, IndividualCard, UpdateMyCardBody } from './my-cards'
export type {
  CreateMySpendingCategoryBody,
  SpendingCategory,
  SpendingFrequency,
  UpdateMySpendingCategoryBody,
} from './my-spending-categories'

// Member-facing view of an active community ban (staff-only fields omitted)
export interface MyActiveCommunityBan {
  id: string
  community_id: string
  community_slug: string | null
  user_id: string
  reason: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
  lifted_at: string | null
  __entity_type: 'community_ban'
}

export interface MyBansResponse {
  bans: MyActiveCommunityBan[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}

export interface MyRemovedPost {
  post_id: string
  post_title: string | null
  post_declared_language: string | null
  post_lingua_rs_detected_language: string | null
  community_id: string | null
  community_slug: string | null
  unpublished_at: string
  post_removal_kind: 'platform' | 'community'
  __entity_type: 'removed_post'
}

export interface MyRemovedPostsResponse {
  removed_posts: MyRemovedPost[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
    start_cursor: string | null
  }
}
export interface PointValuation {
  id: string
  rewards_program_id: string
  value_per_point: ScaledMoney
  note: string | null
  rewards_program: {
    id: string
    name: string
    slug: string
  }
}

export interface RewardsProgramStatus {
  id: string
  rewards_program_status_id: string
  since: string | null
  until: string | null
  rewards_program_status: {
    id: string
    name: string
    slug: string
  }
}

export interface Household {
  id: string
  owner_id: string
  created_at?: string
  updated_at: string
}

export type HouseholdAccess = 'all' | 'owned' | 'member'

export interface HouseholdListOptions {
  access?: HouseholdAccess
  after?: string
  limit?: number
}

export interface HouseholdIndividual {
  id: string
  user_id: string | null
  username: string | null
  updated_at: string
}

export interface HouseholdMembership {
  id: string
  household_id: string
  relationship: string | null
  individual: HouseholdIndividual
  updated_at: string
}

export interface HouseholdSection {
  household: Household
  isOwner: boolean
  memberships: HouseholdMembership[]
  membershipPageInfo: PageInfo
  membershipLoadError: boolean
}

export interface HouseholdSectionListItem {
  id: string
  section: HouseholdSection
}

export interface UserProfile {
  id: string
  markdown: string
}

export interface FinancialProfile {
  user_id: string
  currency: CurrencyCode
  credit_score_range: string | null
  stated_income_range: MoneyRange | null
  total_credit_limit: Money | null
  years_of_credit_history: number | null
  hard_inquiries_12m: number | null
  cards_opened_24m: number | null
  updated_at: string
}

export type UseDisplayNameFrom =
  | 'username'
  | 'facebook'
  | 'x'
  | 'apple'
  | 'google'
  | 'linkedin'
  | 'microsoft'
  | 'github'

export interface PrivateIdentity {
  id: string
  username: string
  profile_image_id: string | null
  use_display_name_from: UseDisplayNameFrom
  facebook_account?: OAuthAccountInfo | null
  apple_account?: OAuthAccountInfo | null
  google_account?: OAuthAccountInfo | null
  x_account?: OAuthAccountInfo | null
  linkedin_account?: OAuthAccountInfo | null
  microsoft_account?: OAuthAccountInfo | null
  github_account?: OAuthAccountInfo | null
  bluesky_account?: BlueskyAccountInfo | null
}

export interface AuthSession {
  id: string
  device_id: string
  device_name: string
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  is_current: boolean
}
