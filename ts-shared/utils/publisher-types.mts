export const PUBLISHER_TYPES = [
  { slug: 'mainstream-media', label: 'Mainstream' },
  { slug: 'public-media', label: 'Public Media' },
  { slug: 'corporate-media', label: 'Corporate' },
  { slug: 'blog', label: 'Blog' },
  { slug: 'aggregator', label: 'Aggregator' },
  { slug: 'forum', label: 'Forum' },
  { slug: 'ugc-platform', label: 'UGC' },
  { slug: 'review', label: 'Review' },
] as const

export const PUBLISHER_TYPE_SLUGS = PUBLISHER_TYPES.map(type => type.slug)
export type PublisherTypeSlug = (typeof PUBLISHER_TYPE_SLUGS)[number]
