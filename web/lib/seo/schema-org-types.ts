/**
 * Schema.org type mapping for topic categories
 * Maps category slugs to their corresponding schema.org @type values
 * Used for Google Review Snippets and structured data
 */

const CATEGORY_SCHEMA_ORG_TYPES: Record<string, string> = {
  books: 'Book',
  courses: 'Course',
  events: 'Event',
  'local-businesses': 'LocalBusiness',
  movies: 'Movie',
  products: 'Product',
  'software-products': 'SoftwareApplication',
  'hardware-products': 'Product',
  recipes: 'Recipe',
  'creative-work-seasons': 'CreativeWorkSeason',
  'tv-show-seasons': 'CreativeWorkSeason',
  'creative-work-series': 'CreativeWorkSeries',
  'tv-shows': 'CreativeWorkSeries',
  'creative-work-episodes': 'Episode',
  'tv-show-episodes': 'Episode',
  games: 'Game',
  songs: 'MusicRecording',
  playlists: 'MusicPlaylist',
  organizations: 'Organization',
  voucha: 'Thing',
}

/**
 * Get the schema.org type for a topic based on its categories
 * Returns the first matching category's type, or 'Thing' as default
 * @param categorySlugs - Array of category slugs from the topic
 * @returns schema.org @type string
 */
export function getSchemaOrgType(categorySlugs: string[]): string {
  for (const slug of categorySlugs) {
    const type = CATEGORY_SCHEMA_ORG_TYPES[slug]
    if (type) return type
  }
  return 'Thing'
}
