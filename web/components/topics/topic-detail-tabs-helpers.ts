import type { TopicMetrics } from '@/types/topics'
import { formatNumber, type NumberFormatLocale } from '@ts-shared/utils/format'

export interface TopicDetailTab {
  name: string
  label: string
  path: string
}

export function pushCrawlHistoryTab(
  tabs: TopicDetailTab[],
  canViewCrawlHistory: boolean | undefined,
  isRssFeed: boolean,
  label: string,
  path: string,
) {
  if (isRssFeed && canViewCrawlHistory) tabs.push({ name: 'crawls', label, path })
}

interface PostTabOptions {
  countKey: keyof NonNullable<TopicMetrics['viewer_count']> & keyof TopicMetrics['count']
  label: string
  name: string
  path: string
  isActive: boolean
  uiLocale?: NumberFormatLocale
}

export function pushPostTab(
  tabs: TopicDetailTab[],
  metrics: Partial<TopicMetrics> | undefined,
  options: PostTabOptions,
) {
  const publicCount = metrics?.count?.[options.countKey] ?? 0
  const viewerCount = metrics?.viewer_count?.[options.countKey] ?? 0

  if (publicCount === 0 && viewerCount === 0 && !options.isActive) {
    return
  }

  tabs.push({
    name: options.name,
    label:
      publicCount > 0 || viewerCount > 0
        ? formatTabLabel(
            options.label,
            publicCount,
            viewerCount > publicCount ||
              metrics?.count_capped?.[options.countKey] === true ||
              metrics?.viewer_count_capped?.[options.countKey] === true,
            options.uiLocale,
          )
        : options.label,
    path: options.path,
  })
}

export function formatTabLabel(
  label: string,
  count: number,
  hasMore: boolean = false,
  uiLocale?: NumberFormatLocale,
) {
  return `${label} (${formatNumber(count, uiLocale)}${hasMore ? '+' : ''})`
}

export function hasCappedPostCounts(metrics: Partial<TopicMetrics> | undefined): boolean {
  return (['discussions', 'reviews', 'data-points'] as const).some(
    key => metrics?.count_capped?.[key] || metrics?.viewer_count_capped?.[key],
  )
}
