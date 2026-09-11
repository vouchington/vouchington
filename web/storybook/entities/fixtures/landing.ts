import type {
  LandingPageCandidates,
  LandingPageWithItems,
  PublicLandingPage,
  ProfileLink,
} from './types'
import { now } from './shared'
import { posts } from './posts'
import { topics } from './topics'
import { storyCurrentUser } from './users'

const profileLinks: ProfileLink[] = [
  {
    id: 'profile-link-1',
    user_id: storyCurrentUser.id,
    link_type: 'url',
    sort_order: 0,
    url: 'https://alex.example',
    handle: null,
    name: 'Personal site',
    image_id: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'profile-link-2',
    user_id: storyCurrentUser.id,
    link_type: 'github',
    sort_order: 1,
    url: null,
    handle: 'alex',
    name: null,
    image_id: null,
    created_at: now,
    updated_at: now,
  },
]
export const landingPageCandidates: LandingPageCandidates = {
  profile_links: profileLinks,
  reviews: [
    {
      id: posts[1]!.id,
      title: posts[1]!.title,
      declared_language: posts[1]!.declared_language ?? null,
      lingua_rs_detected_language: posts[1]!.lingua_rs_detected_language ?? null,
      slug: posts[1]!.slug ?? null,
      markdown: posts[1]!.markdown,
      created_at: now,
      review_topic_ratings: [
        {
          topic_id: topics[1]!.id,
          topic_name: topics[1]!.name,
          topic_slug: topics[1]!.slug,
          rating: 5,
          order_index: 0,
        },
      ],
    },
  ],
  referral_links: [
    {
      id: 'referral-link-1',
      referral_program_id: 'referral-program-1',
      referral_program_name: 'Sapphire Reserve',
      referral_program_slug: 'sapphire-reserve',
      label: 'Use my card referral',
      url: 'https://bank.example/ref/alex',
    },
  ],
}
export const landingPageWithItems: LandingPageWithItems = {
  id: 'landing-page-1',
  user_id: storyCurrentUser.id,
  title: 'Alex Morgan rewards setup',
  subtitle: 'Cards, transfer partners, and referral links I actually use.',
  slug: 'rewards',
  is_default: true,
  created_at: now,
  updated_at: now,
  items: [
    { id: 'lp-item-1', type: 'profile_link', profile_link: profileLinks[0]! },
    { id: 'lp-item-2', type: 'review', review: landingPageCandidates.reviews[0]! },
    {
      id: 'lp-item-3',
      type: 'referral_link',
      referral_link: landingPageCandidates.referral_links[0]!,
    },
    {
      id: 'lp-item-4',
      type: 'topic_group',
      topic: {
        id: topics[1]!.id,
        name: topics[1]!.name,
        slug: topics[1]!.slug,
        topic_type: topics[1]!.topic_type,
      },
      entries: [{ id: 'lp-entry-1', type: 'review', review: landingPageCandidates.reviews[0]! }],
    },
    { id: 'lp-item-5', type: 'link', label: 'My Portfolio', url: 'https://portfolio.example' },
  ],
}
export const publicLandingPage: PublicLandingPage = {
  user: {
    ...storyCurrentUser,
    username: storyCurrentUser.username!,
    display_name: 'Alex Morgan',
    markdown: 'I publish practical card reviews and keep my referral links current.',
  },
  landing_page: landingPageWithItems,
}
