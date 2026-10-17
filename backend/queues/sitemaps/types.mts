import type { SitemapFamilyType, SitemapPostType } from '@services/sitemaps/types'

export type PostDayJobData = {
  postType: SitemapPostType
  day: string
}

export type SitemapFamilyJobData = {
  family: SitemapFamilyType
}
