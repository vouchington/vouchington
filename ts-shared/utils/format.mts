export {
  formatBytes,
  formatCompactNumber,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUtcDate,
  generateExcerpt,
  type NumberFormatLocale,
} from '@vouchington/utils/format'
export { formatHostnameForDisplay as formatDomainForDisplay } from '@vouchington/utils/urls'
export { calculateWeightedAverage as calculateAverageRating } from '@vouchington/utils/format'

/**
 * User-facing labels for known post type slugs.
 */
const POST_TYPE_LABELS: Record<string, string> = {
  data_point: 'Data Point',
  discussion: 'Discussion',
  review: 'Review',
  comment: 'Comment',
  story: 'Story',
  article: 'Article',
  blog_post: 'Blog Post',
  link: 'Link',
}

/**
 * Convert a post type slug into a user-facing label.
 * Falls back to the raw value when no mapping exists.
 * @param postType Post type slug
 * @returns Human-readable post type label
 */
export function humanizePostType(postType: string): string {
  return POST_TYPE_LABELS[postType] ?? postType
}

const TOPIC_TYPE_LABELS: Record<string, string> = {
  topic: 'Topic',
  rewards_program: 'Rewards Program',
  rewards_program_status: 'Rewards Program Status',
  referral_program: 'Referral Program',
  card: 'Card',
  bank_account: 'Bank Account',
  person: 'Person',
  public_figure: 'Public Figure',
  organization: 'Organization',
  brand: 'Brand',
  rss_feed: 'Source',
}

export function humanizeTopicType(topicType: string): string {
  return TOPIC_TYPE_LABELS[topicType] ?? topicType
}
