'use client'
import { usePathname } from 'next/navigation'
import { EntityMenubarNav } from '@/components/shared/entity-menubar-nav'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { isActivePath, isActiveSegment } from '@/lib/utils/path'
import type { TopicMetrics, TopicTypes } from '@/types/topics'
import {
  formatTabLabel,
  pushCrawlHistoryTab,
  pushPostTab,
  type TopicDetailTab,
} from './topic-detail-tabs-helpers'
import { buildAdminTabItems } from './topic-admin-tab-items'
import { buildTopicDetailMenubarItems } from './topic-detail-tabs-menubar-items'
type TopicDetailTabsProps = {
  topicType: string
  topicId: string
  topicSlug?: string | null
  metrics?: Partial<TopicMetrics>
  topicTypeName?: TopicTypes
  allowReviews?: boolean
  referralProgramId?: string | null
  isAuthenticated?: boolean
  isAdmin?: boolean
  canViewCrawlHistory?: boolean
}
export function TopicDetailTabs({
  topicType,
  topicId,
  topicSlug,
  metrics,
  topicTypeName,
  allowReviews,
  referralProgramId,
  isAuthenticated,
  isAdmin,
  canViewCrawlHistory,
}: TopicDetailTabsProps) {
  const pathname = usePathname()
  const uiLocale = useUiLocale()
  const t = useTranslations()
  const idOrSlug = topicSlug ?? topicId
  const tabs: TopicDetailTab[] = []
  const totalPostCount =
    (metrics?.count?.discussions ?? 0) +
    (metrics?.count?.reviews ?? 0) +
    (metrics?.count?.['data-points'] ?? 0)
  const totalViewerCount =
    (metrics?.viewer_count?.discussions ?? 0) +
    (metrics?.viewer_count?.reviews ?? 0) +
    (metrics?.viewer_count?.['data-points'] ?? 0)
  const isOnPostsRoute = isActiveSegment(pathname, 'posts')
  const postsLabel = t('extracted.topics.topicDetailTabs.posts_a80811cf')
  if (totalPostCount > 0 || totalViewerCount > 0 || isOnPostsRoute) {
    tabs.push({
      name: 'posts',
      label:
        totalPostCount > 0 || totalViewerCount > 0
          ? formatTabLabel(postsLabel, totalPostCount, totalViewerCount > totalPostCount, uiLocale)
          : postsLabel,
      path: `/${topicType}/${idOrSlug}/posts`,
    })
  }
  if (allowReviews !== false) {
    pushPostTab(tabs, metrics, {
      countKey: 'reviews',
      label: t('extracted.topics.topicDetailTabs.reviews_84cb7871'),
      name: 'reviews',
      path: `/${topicType}/${idOrSlug}/reviews`,
      isActive: isActiveSegment(pathname, 'reviews'),
      uiLocale,
    })
  }
  pushPostTab(tabs, metrics, {
    countKey: 'data-points',
    label: t('extracted.topics.topicDetailTabs.dataPoints_1da65e3a'),
    name: 'data-points',
    path: `/${topicType}/${idOrSlug}/data-points`,
    isActive: isActiveSegment(pathname, 'data-points'),
    uiLocale,
  })
  if (topicTypeName === 'referral_program' || referralProgramId != null) {
    tabs.push({
      name: 'referral-links',
      label: t('extracted.topics.topicDetailTabs.referralLinks_4348d2ad'),
      path: `/${topicType}/${idOrSlug}/referral-links`,
    })
  }
  const latestCount = metrics?.count?.latest ?? 0
  const latestLabel = t('extracted.topics.topicDetailTabs.latest_8730d3c2')
  if (latestCount > 0 || isActiveSegment(pathname, 'latest') || topicTypeName === 'rss_feed') {
    tabs.push({
      name: 'latest',
      label:
        latestCount > 0 ? formatTabLabel(latestLabel, latestCount, false, uiLocale) : latestLabel,
      path: `/${topicType}/${idOrSlug}/latest`,
    })
  }
  pushCrawlHistoryTab(
    tabs,
    canViewCrawlHistory,
    topicTypeName === 'rss_feed',
    t('extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5'),
    `/${topicType}/${idOrSlug}/crawls`,
  )
  const newsCount = metrics?.count?.news ?? 0
  const newsLabel = t('extracted.topics.topicDetailTabs.news_69752f23')
  if (newsCount > 0 || isActiveSegment(pathname, 'news')) {
    tabs.push({
      name: 'news',
      label: newsCount > 0 ? formatTabLabel(newsLabel, newsCount, false, uiLocale) : newsLabel,
      path: `/${topicType}/${idOrSlug}/news`,
    })
  }
  if (isAuthenticated) {
    tabs.push({
      name: 'manage-tags',
      label: t('extracted.topics.topicDetailTabs.manageTags_7a3cc33f'),
      path: `/${topicType}/${topicId}/tags/topic`,
    })
  }
  if (tabs.length === 0 && !isAdmin) return null
  const isOnSettingsPath = isAdmin && isActivePath(pathname, `/${topicType}/${idOrSlug}/settings`)

  const activeTab = isOnSettingsPath
    ? 'settings'
    : (tabs.find(tab => {
        if (tab.name === 'manage-tags') {
          return isActivePath(pathname, `/${topicType}/${topicId}/tags`)
        }
        if (tab.name === 'crawls') {
          return isActivePath(pathname, tab.path)
        }
        return isActiveSegment(pathname, tab.name)
      })?.name ??
      tabs[0]?.name ??
      'posts')
  const adminMenubarItems = isAdmin
    ? buildAdminTabItems(topicType, topicId, topicSlug, pathname, topicTypeName)
    : []
  const menubarItems = buildTopicDetailMenubarItems({
    tabs,
    activeTab,
    pathname,
    topicType,
    topicId,
    topicTypeName,
    t,
  })
  return (
    <EntityMenubarNav
      items={[...menubarItems, ...adminMenubarItems]}
      ariaLabel={t('extracted.topics.topicDetailTabs.topicDetailNavigation_2f3cc382')}
      preserveScrollOnNavigation
    />
  )
}
