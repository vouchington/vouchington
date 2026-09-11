import type { SITEMAP_CONFIG } from '@voucha/config/sitemaps'

export type SitemapPostType = (typeof SITEMAP_CONFIG.POST_TYPES)[number]
export type SitemapFamilyType = (typeof SITEMAP_CONFIG.FAMILY_TYPES)[number]

export interface SitemapUrl {
  loc: string
  lastmod: string
}

export type TrackedDayRange = {
  earliestDay: string
  latestDay: string
}

export interface SitemapPost {
  slug: string
  post_type: SitemapPostType
  updated_at: Date
  review_updated_at?: Date | null // From post_review_topic_ratings (max updated_at)
}

export interface SitemapPostWithId extends SitemapPost {
  id: string
}

export interface SitemapFamilyEntry {
  path: string
  updated_at: Date
}
