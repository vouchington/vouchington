import type { SitemapFamilyType, SitemapPostType } from '@services/sitemaps/types'

export type PostDayJobData = {
  postType: SitemapPostType
  day: string
}

export type PostTypeIndexJobData = {
  postType: SitemapPostType
}

export type SitemapFamilyJobData = {
  family: SitemapFamilyType
}

export type SitemapPostDayJobs = 'processUpdatePostDaySitemap'
export type SitemapIndexJobs =
  | 'processUpdatePostTypeIndex'
  | 'processUpdatePostsIndex'
  | 'processUpdateFamilySitemap'
  | 'processUpdateRootIndex'
export type SitemapDispatcherJobs =
  | 'processNightlyBackfillWeekDispatcher'
  | 'processWeeklyBackfillMonthDispatcher'
  | 'processMonthlyBackfillArchiveDispatcher'
