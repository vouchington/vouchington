import type { Post, PostBroadcast, PostPrivacy, PostType } from '@/types/posts'
import type { FinancialProfile } from '@/types/my'

export interface RelatedUrl {
  id: string
  url: string
}

export interface PostFormProps {
  postType: PostType
  post?: Post
  initialRelatedUrls?: RelatedUrl[]
  userFinancialProfile?: FinancialProfile | null
  isAdmin?: boolean
  initialReviewTopic?: { id: string; name: string }
  initialDataPointTopic?: { id: string; name: string; vertical: 'credit_card' | 'bank_account' }
  initialDiscussionCategories?: Array<{ id: string; name: string; hashtag?: string }>
  communityId?: string
  communitySlug?: string
  communityVisibility?: 'public' | 'private'
  communityPendingRedirectPath?: string
  initialCommunitySlug?: string
  communityOptions?: CommunityPostOption[]
  onSubmitted?: (href: string) => void
}

export interface AudienceDefaults {
  initialBroadcast: PostBroadcast
  initialPrivacy: PostPrivacy
  isCommunityPost: boolean
  isPrivateCommunityPost: boolean
}

export interface CommunityPostOption {
  id: string
  name: string
  slug: string
  visibility: 'public' | 'private'
  post_approval_required_at: string | null
}
