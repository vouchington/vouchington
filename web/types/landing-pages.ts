import type { ProfileLink, User } from './user'

export interface LandingPage {
  id: string
  user_id: string
  title: string
  subtitle: string | null
  slug: string
  is_default: boolean
  created_at: string
  updated_at: string
}

interface LandingPageCandidateReview {
  id: string
  title: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  slug: string | null
  markdown: string
  created_at: string
  review_topic_ratings: Array<{
    topic_id: string
    topic_name: string
    topic_slug: string
    rating: number
    order_index: number
  }>
}

interface LandingPageCandidateReferralLink {
  id: string
  referral_program_id: string
  referral_program_name: string
  referral_program_slug: string
  label: string | null
  url: string
}

export interface LandingPageCandidates {
  profile_links: ProfileLink[]
  reviews: LandingPageCandidateReview[]
  referral_links: LandingPageCandidateReferralLink[]
}

interface LandingPageTopic {
  id: string
  name: string
  slug: string
  topic_type: string
}

type LandingPageTopicGroupEntry =
  | { id: string; type: 'review'; review: LandingPageCandidateReview }
  | { id: string; type: 'referral_link'; referral_link: LandingPageCandidateReferralLink }

type PublicLandingPageUser = Omit<User, 'username' | 'markdown'> & {
  username: string
  display_name: string
  markdown: string
}

export type LandingPageItem =
  | { id: string; type: 'profile_link'; profile_link: ProfileLink }
  | { id: string; type: 'review'; review: LandingPageCandidateReview }
  | { id: string; type: 'referral_link'; referral_link: LandingPageCandidateReferralLink }
  | {
      id: string
      type: 'topic_group'
      topic: LandingPageTopic
      entries: LandingPageTopicGroupEntry[]
    }
  | { id: string; type: 'link'; label: string; url: string }

export type LandingPageWithItems = LandingPage & {
  items: LandingPageItem[]
}

export type LandingPageItemInput =
  | { type: 'profile_link'; profile_link_id: string }
  | { type: 'review'; review_id: string }
  | { type: 'referral_link'; referral_link_id: string }
  | {
      type: 'topic_group'
      topic_id: string
      entries: Array<
        { type: 'review'; review_id: string } | { type: 'referral_link'; referral_link_id: string }
      >
    }
  | { type: 'link'; label: string; url: string }

export interface PublicLandingPage {
  user: PublicLandingPageUser
  landing_page: LandingPageWithItems
}

export interface LandingPageItemClickStats {
  item_id: string
  item_type: string
  click_count: number
}

export interface DailyStats {
  date: string
  visits: number
  clicks: number
  unique_visitors: number
}

export interface UtmSourceStats {
  utm_source: string
  visits: number
}

export interface ConversionFunnel {
  total_visits: number
  total_clicks: number
  total_signups: number
  visit_to_click_rate: number
}

export interface LandingPageAnalytics {
  total_visits: number
  total_clicks: number
  ctr: number
  unique_visitors: number
  item_clicks: LandingPageItemClickStats[]
  daily_stats: DailyStats[]
  utm_sources: UtmSourceStats[]
  conversion_funnel: ConversionFunnel
}
