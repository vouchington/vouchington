/**
 * Route configurations for code reuse
 * Similar routes (posts/reviews/discussions) share components with config-based differentiation
 */

import type { MessageKey } from '@ts-shared/ui-messages'
import type { PostType } from '@/types/posts'
import type { TopicTypes } from '@/types/topics'

export interface PostRouteConfig {
  title: MessageKey
  description: MessageKey
  postTypes?: PostType[] // undefined = all types
  pluralPath: string // e.g., 'reviews', 'discussions'
  singularPath: string // e.g., 'review', 'discussion'
}

export interface TopicRouteConfig {
  title: MessageKey
  description: MessageKey
  topicTypes?: TopicTypes[] // undefined = all types
  spendingCategory?: boolean // filter by spending_category flag
  pluralPath: string // e.g., 'cards', 'rewards-programs'
  singularPath: string // e.g., 'card', 'rewards-program'
}

/**
 * Post route configurations
 */
export const postRouteConfigs = {
  posts: {
    title: 'extracted.lib.routeConfigs.allPosts_0fae3f21',
    description: 'extracted.lib.routeConfigs.browseAllCommunityPostsReviewsDiscussions_383c6992',
    postTypes: undefined, // All types
    pluralPath: 'posts',
    singularPath: 'post',
  },
  stories: {
    title: 'extracted.lib.routeConfigs.stories_6d09cf57',
    description: 'extracted.lib.routeConfigs.readCommunityStoriesAndNarrativesShared_d638b879',
    postTypes: ['story'] as PostType[],
    pluralPath: 'stories',
    singularPath: 'story',
  },
  reviews: {
    title: 'extracted.lib.routeConfigs.reviews_84cb7871',
    description: 'extracted.lib.routeConfigs.readCommunityReviewsRatingsAndFirst_95696cf3',
    postTypes: ['review'] as PostType[],
    pluralPath: 'reviews',
    singularPath: 'review',
  },
  discussions: {
    title: 'extracted.lib.routeConfigs.discussions_60157cfc',
    description: 'extracted.lib.routeConfigs.joinDiscussionsAboutProductsServicesAnd_5e82b04a',
    postTypes: ['discussion'] as PostType[],
    pluralPath: 'discussions',
    singularPath: 'discussion',
  },
  articles: {
    title: 'extracted.lib.routeConfigs.articles_b14ac78a',
    description: 'extracted.lib.routeConfigs.readVouchaArticlesWithAnalysisGuides_6d14f3a9',
    postTypes: ['article'] as PostType[],
    pluralPath: 'articles',
    singularPath: 'article',
  },
  blog: {
    title: 'extracted.lib.routeConfigs.vouchaBlog_deb6c4a6',
    description: 'extracted.lib.routeConfigs.readVouchaBlogPostsWithAnalysis_175ebd86',
    postTypes: ['blog_post'] as PostType[],
    pluralPath: 'blog',
    singularPath: 'blog-post',
  },
  'data-points': {
    title: 'extracted.lib.routeConfigs.dataPoints_1da65e3a',
    description: 'extracted.lib.routeConfigs.seeUserSubmittedDataPointsApprovals_2e996bf3',
    postTypes: ['data_point'] as PostType[],
    pluralPath: 'data-points',
    singularPath: 'data-point',
  },
  links: {
    title: 'extracted.lib.routeConfigs.links_9024c197',
    description: 'extracted.lib.routeConfigs.browseLinkPostsSharedByThe_b28e91a7',
    postTypes: ['link'] as PostType[],
    pluralPath: 'links',
    singularPath: 'link',
  },
} satisfies Record<string, PostRouteConfig>

/**
 * Topic route configurations
 */
export const topicRouteConfigs = {
  topics: {
    title: 'extracted.lib.routeConfigs.topics_e22820fc',
    description: 'extracted.lib.routeConfigs.browseProductsProgramsNewsSourcesAnd_dceb1c5c',
    topicTypes: undefined, // All types
    pluralPath: 'topics',
    singularPath: 'topic',
  },
  cards: {
    title: 'extracted.lib.routeConfigs.cards_a52fcbbc',
    description: 'extracted.lib.routeConfigs.browseCardsCompareBenefitsAndFollow_804d66df',
    topicTypes: ['card'] as TopicTypes[],
    pluralPath: 'cards',
    singularPath: 'card',
  },
  'rewards-programs': {
    title: 'extracted.lib.routeConfigs.rewardsPrograms_cfc1c858',
    description: 'extracted.lib.routeConfigs.exploreRewardsProgramsLoyaltyBenefitsAnd_b167e4cb',
    topicTypes: ['rewards_program'] as TopicTypes[],
    pluralPath: 'rewards-programs',
    singularPath: 'rewards-program',
  },
  'referral-programs': {
    title: 'extracted.lib.routeConfigs.referralPrograms_ceb8b9ad',
    description: 'extracted.lib.routeConfigs.browseReferralProgramsBonusOffersAnd_97c57000',
    topicTypes: ['referral_program'] as TopicTypes[],
    pluralPath: 'referral-programs',
    singularPath: 'referral-program',
  },
  'rewards-program-statuses': {
    title: 'extracted.lib.routeConfigs.rewardsProgramStatuses_b2a04de2',
    description: 'extracted.lib.routeConfigs.compareStatusTiersWithCommunityReviews_dc97d0f3',
    topicTypes: ['rewards_program_status'] as TopicTypes[],
    pluralPath: 'rewards-program-statuses',
    singularPath: 'rewards-program-status',
  },
  sources: {
    title: 'extracted.lib.routeConfigs.newsSources_238ad263',
    description: 'extracted.lib.routeConfigs.browseRssFeedsAndNewsSources_f28d76c3',
    topicTypes: ['rss_feed'] as TopicTypes[],
    pluralPath: 'sources',
    singularPath: 'source',
  },
  instances: {
    title: 'extracted.lib.routeConfigs.fediverseInstances_d4a8c0d1',
    description: 'extracted.lib.routeConfigs.browseFediverseInstancesTrackedByVoucha_a37e5edb',
    topicTypes: ['fediverse_instance'] as TopicTypes[],
    pluralPath: 'instances',
    singularPath: 'instance',
  },
  'spending-categories': {
    title: 'extracted.lib.routeConfigs.spendingCategories_3ed30dfb',
    description: 'extracted.lib.routeConfigs.browseSpendingCategoriesUsedToCompare_0408c985',
    spendingCategory: true,
    pluralPath: 'spending-categories',
    singularPath: 'spending-category',
  },
} satisfies Record<string, TopicRouteConfig>

const postSlugToType: Record<string, PostType> = {
  review: 'review',
  discussion: 'discussion',
  'data-point': 'data_point',
  article: 'article',
  'blog-post': 'blog_post',
  story: 'story',
  link: 'link',
}

const postTypeToSlug = Object.fromEntries(
  Object.entries(postSlugToType).map(([slug, type]) => [type, slug]),
) as Record<PostType, string>

export function getPostTypeFromSlug(slug: string): PostType | undefined {
  return Object.hasOwn(postSlugToType, slug) ? postSlugToType[slug] : undefined
}

export function getPostSlugFromType(postType: PostType): string {
  return postTypeToSlug[postType] ?? postType
}
