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

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Format an ISO timestamp as a UTC date and time in the UI locale. Sibling of `formatUtcDate`
 * for surfaces that show a time of day; the fixed UTC zone keeps server render and client
 * hydration identical.
 * @param value ISO timestamp
 * @param locale UI locale
 * @returns Localized date and time with a short zone name
 */
export function formatUtcDateTime(value: string, locale: string): string {
  let formatter = dateTimeFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    })
    dateTimeFormatters.set(locale, formatter)
  }
  return formatter.format(new Date(value))
}

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
