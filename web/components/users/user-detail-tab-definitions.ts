import type { useTranslations } from '@/lib/i18n/use-translations'
import type { UserMetrics } from '@/types/user'
import type { UserDetailTab, BuildUserDetailTabsOptions } from './user-detail-tab-types'
import type { TopLevelTabName } from './user-profile-tabs-config'
import { appendContentTab, appendCountTab } from './user-detail-tab-builders'
import { createUserPathname } from '@/lib/links/entity-href'
import { formatNumber } from '@ts-shared/utils/format'

export function buildUserProfileDropdownItems(
  t: ReturnType<typeof useTranslations>,
  tabName: TopLevelTabName,
  usernameOrId: string,
  metrics: UserMetrics | undefined,
  routeSuffix: string,
  uiLocale: BuildUserDetailTabsOptions['uiLocale'],
  currentFeedType?: string,
): UserDetailTab[] | null {
  if (tabName === 'about' || tabName === 'topics' || tabName === 'communities') {
    return null
  }

  const userPath = createUserPathname(usernameOrId)
  const tabs: UserDetailTab[] = []

  if (tabName === 'posts') {
    const allCount =
      (metrics?.count.reviews ?? 0) +
      (metrics?.count.discussions ?? 0) +
      (metrics?.count.comments ?? 0)
    const allViewerCount =
      (metrics?.viewer_count?.reviews ?? 0) +
      (metrics?.viewer_count?.discussions ?? 0) +
      (metrics?.viewer_count?.comments ?? 0)
    if (allCount > 0 || allViewerCount > 0 || routeSuffix === '/posts') {
      const allCountDisplay = `${formatNumber(allCount, uiLocale)}${allViewerCount > allCount ? '+' : ''}`
      tabs.push({
        value: 'posts-all',
        label: t('extracted.users.userDetailTabDefinitions.allCount_a58a7734', {
          count: allCountDisplay,
        }),
        href: `${userPath}/posts`,
        routeSuffix: '/posts',
      })
    }
    appendContentTab(
      tabs,
      userPath,
      metrics,
      'discussions',
      t,
      'extracted.users.userDetailTabBuilders.discussionsCount_fb82771e',
      routeSuffix,
      uiLocale,
    )
    appendContentTab(
      tabs,
      userPath,
      metrics,
      'reviews',
      t,
      'extracted.users.userDetailTabBuilders.reviewsCount_7dc3b459',
      routeSuffix,
      uiLocale,
    )
    appendContentTab(
      tabs,
      userPath,
      metrics,
      'comments',
      t,
      'extracted.users.userDetailTabBuilders.commentsCount_147198f2',
      routeSuffix,
      uiLocale,
    )
  } else if (tabName === 'friends') {
    const followingCount = metrics?.count.users_following ?? 0
    const followersCount = metrics?.count.users_followers ?? 0
    appendCountTab(
      tabs,
      followingCount,
      'users-following',
      t,
      'extracted.users.userDetailTabBuilders.followingCount_cea8f8cd',
      userPath,
      '/users/following',
      routeSuffix,
      uiLocale,
    )
    appendCountTab(
      tabs,
      followersCount,
      'users-followers',
      t,
      'extracted.users.userDetailTabBuilders.followedByCount_0849e5b9',
      userPath,
      '/users/followers',
      routeSuffix,
      uiLocale,
    )
  } else if (tabName === 'sources') {
    const allCount = metrics?.count.rss_feeds_following ?? 0
    const isOnRssFeedsRoute = routeSuffix.startsWith('/rss-feeds')
    if (allCount > 0 || isOnRssFeedsRoute) {
      tabs.push(
        {
          value: 'sources-all',
          label: t('extracted.users.userDetailTabDefinitions.allCount_a58a7734', {
            count: formatNumber(allCount, uiLocale),
          }),
          href: `${userPath}/rss-feeds/following`,
          routeSuffix: '/rss-feeds/following',
          active: !currentFeedType,
        },
        {
          value: 'sources-news',
          label: t('extracted.users.userDetailTabDefinitions.news_69752f23'),
          href: `${userPath}/rss-feeds/following?feed_type=article`,
          routeSuffix: '/rss-feeds/following',
          active: currentFeedType === 'article',
        },
        {
          value: 'sources-podcasts',
          label: t('extracted.users.userDetailTabDefinitions.podcasts_6ac749b3'),
          href: `${userPath}/rss-feeds/following?feed_type=podcast`,
          routeSuffix: '/rss-feeds/following',
          active: currentFeedType === 'podcast',
        },
        {
          value: 'sources-videos',
          label: t('extracted.users.userDetailTabDefinitions.videos_c9a96394'),
          href: `${userPath}/rss-feeds/following?feed_type=video`,
          routeSuffix: '/rss-feeds/following',
          active: currentFeedType === 'video',
        },
      )
    }
  }

  return tabs
}
