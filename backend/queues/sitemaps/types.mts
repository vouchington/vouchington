import type { SitemapFamilyType, SitemapPostType } from '@services/sitemaps/types'

export type PostDayJobData = {
  postType: SitemapPostType
  day: string
  /** Set only on a continuation: the generation it resumes. */
  generationId?: string
}

export type SitemapFamilyJobData = {
  family: SitemapFamilyType
  generationId?: string
}
