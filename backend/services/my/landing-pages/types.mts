import type { PublicUser } from '@services/users'
import type { ProfileLink } from '../profile-links.mts'

export type LandingPage = {
  id: string
  user_id: string
  title: string
  subtitle: string | null
  slug: string
  is_default: boolean
  created_at: Date
  updated_at: Date
}

export type LandingPageCandidateReview = {
  id: string
  title: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  slug: string | null
  markdown: string
  created_at: Date
  review_topic_ratings: Array<{
    topic_id: string
    topic_name: string
    topic_slug: string
    rating: number
    order_index: number
  }>
}

export type LandingPageCandidateReferralLink = {
  id: string
  referral_program_id: string
  referral_program_name: string
  referral_program_slug: string
  label: string | null
  url: string
}

export type LandingPageCandidates = {
  can_create_landing_pages: boolean
  profile_links: ProfileLink[]
  reviews: LandingPageCandidateReview[]
  referral_links: LandingPageCandidateReferralLink[]
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

export type LandingPageTopic = {
  id: string
  name: string
  slug: string
  topic_type: string
}

export type LandingPageTopicGroupEntry =
  | { id: string; type: 'review'; review: LandingPageCandidateReview }
  | { id: string; type: 'referral_link'; referral_link: LandingPageCandidateReferralLink }

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

type LandingPageUser = PublicUser & {
  display_name: string
  markdown: string
}

export type PublicLandingPage = {
  user: LandingPageUser
  landing_page: LandingPageWithItems
}

export type LandingPageItemRow = {
  id: string
  item_type: 'profile_link' | 'review' | 'referral_link' | 'topic_group' | 'link'
  profile_link_id: string | null
  review_id: string | null
  referral_link_id: string | null
  topic_id: string | null
  link_label: string | null
  link_url: string | null
}
