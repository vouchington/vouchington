export const nativeLandingPageSummary = {
  id: 'landing-page-1',
  user_id: 'user-abc',
  title: 'My Links',
  subtitle: 'Cards and reviews I recommend',
  slug: 'links',
  is_default: true,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-29T10:00:00Z',
}

export const nativeLandingPageTravelSummary = {
  id: 'landing-page-2',
  user_id: 'user-abc',
  title: 'Travel Stack',
  subtitle: null,
  slug: 'travel',
  is_default: false,
  created_at: '2026-06-28T11:00:00Z',
  updated_at: '2026-06-29T11:00:00Z',
}

export const nativeLandingProfileLink = {
  id: 'profile-link-1',
  user_id: 'user-abc',
  link_type: 'url',
  sort_order: 1,
  url_id: 'url-profile-1',
  url: 'https://example.com',
  handle: null,
  name: 'Website',
  image_id: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
}

export const nativeLandingReview = {
  id: 'review-1',
  title: 'Best Travel Card',
  declared_language: 'en',
  lingua_rs_detected_language: 'en',
  slug: 'best-travel-card',
  markdown: 'Useful review',
  created_at: '2026-06-28T10:00:00Z',
  review_topic_ratings: [
    {
      topic_id: 'topic-1',
      topic_name: 'Travel Cards',
      topic_slug: 'travel-cards',
      rating: 5,
      order_index: 0,
    },
  ],
}

export const nativeLandingGroupReview = {
  id: 'review-2',
  title: 'Travel Card Benefits',
  declared_language: null,
  lingua_rs_detected_language: 'en',
  slug: 'travel-card-benefits',
  markdown: 'A second useful review',
  created_at: '2026-06-28T11:00:00Z',
  review_topic_ratings: [
    {
      topic_id: 'topic-1',
      topic_name: 'Travel Cards',
      topic_slug: 'travel-cards',
      rating: 4,
      order_index: 0,
    },
  ],
}

export const nativeLandingReferralLink = {
  id: 'referral-link-1',
  referral_program_id: 'topic-1',
  referral_program_name: 'Travel Cards',
  referral_program_slug: 'travel-cards',
  label: 'Apply',
  url: 'https://example.com/apply',
}

export const nativeLandingGroupReferralLink = {
  id: 'referral-link-2',
  referral_program_id: 'topic-1',
  referral_program_name: 'Travel Cards',
  referral_program_slug: 'travel-cards',
  label: 'Learn more',
  url: 'https://example.com/travel-card',
}

export const nativeLandingPageDetail = {
  ...nativeLandingPageSummary,
  items: [
    { id: 'item-profile-1', type: 'profile_link', profile_link: nativeLandingProfileLink },
    { id: 'item-review-1', type: 'review', review: nativeLandingReview },
    { id: 'item-referral-1', type: 'referral_link', referral_link: nativeLandingReferralLink },
    {
      id: 'item-topic-group-1',
      type: 'topic_group',
      topic: {
        id: 'topic-1',
        name: 'Travel Cards',
        slug: 'travel-cards',
        topic_type: 'referral_program',
      },
      entries: [
        { id: 'group-entry-review-1', type: 'review', review: nativeLandingGroupReview },
        {
          id: 'group-entry-referral-1',
          type: 'referral_link',
          referral_link: nativeLandingGroupReferralLink,
        },
      ],
    },
    { id: 'item-link-1', type: 'link', label: 'Newsletter', url: 'https://example.com/newsletter' },
  ],
} as const
