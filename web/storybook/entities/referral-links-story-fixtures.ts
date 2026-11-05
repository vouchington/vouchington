import { storyCurrentUser } from './entity-fixtures'
import type {
  PrioritizedReferralLinksResponse,
  ReferralLinkFeedItem,
  ReferralLinkFeedUser,
} from '@/types/api-responses'

export const sampleUser = {
  id: storyCurrentUser.id,
  username: storyCurrentUser.username!,
  display_name: 'Alex Morgan',
}

export const sampleLink = {
  id: 'link-sample',
  user_id: storyCurrentUser.id,
  is_official: false,
  referral_program_id: 'rp-chase',
  url: 'https://www.referyourchasecard.com/m/21a/abc123',
  label: 'My Chase Sapphire link',
  priority_group: 1,
  contribution_rank: 1,
  tier_rank: 1,
  best_score: 10,
  review_post_id: null,
  review_post_slug: null,
  review_avg_rating: null,
}

export const sampleLinkWithReview = {
  ...sampleLink,
  id: 'link-with-review',
  review_post_id: 'post-chase-review',
  review_post_slug: 'chase-sapphire-preferred-review',
  review_avg_rating: 4.5,
}

export const sampleResponse: PrioritizedReferralLinksResponse = {
  links: [
    sampleLink,
    {
      ...sampleLink,
      id: 'link-2',
      user_id: 'user-bob',
      label: "Bob's Chase link",
      priority_group: 2,
    },
  ],
  users: {
    [storyCurrentUser.id]: sampleUser,
    'user-bob': { id: 'user-bob', username: 'bob', display_name: 'Bob Chen' },
  },
}

export const emptyResponse: PrioritizedReferralLinksResponse = {
  links: [],
  users: {},
}

export const feedUser: ReferralLinkFeedUser = {
  id: storyCurrentUser.id,
  username: storyCurrentUser.username!,
  display_name: 'Alex Morgan',
  profile_image_id: null,
}

export const feedItem: ReferralLinkFeedItem = {
  id: 'feed-link-1',
  user_id: storyCurrentUser.id,
  referral_program_id: 'rp-chase',
  referral_program_name: 'Chase Sapphire Preferred',
  referral_program_slug: 'chase-sapphire-preferred',
  url: 'https://www.referyourchasecard.com/m/21a/abc123',
  label: 'My Chase Sapphire link',
}
