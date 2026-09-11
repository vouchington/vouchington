import type { MessageKey } from '@ts-shared/ui-messages'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { TitleRouteDropdown } from '@/components/shared/title-route-dropdown'
import { getTranslations } from '@/lib/i18n/get-translations'
import { feedRouteConfigs, type FeedCategory } from '@/lib/feed-route-configs'

const feedTitleLabels: Record<FeedCategory, MessageKey> = {
  posts: 'extracted.feed.feedPageHeader.myPostsFeed_a1ed6e47',
  news: 'extracted.feed.feedPageHeader.myNewsFeed_45cd71ae',
  podcasts: 'extracted.feed.feedPageHeader.myPodcastEpisodesFeed_a0c523e2',
  videos: 'extracted.feed.feedPageHeader.myVideoFeed_d4cade0f',
  'referral-links': 'extracted.feed.feedPageHeader.myReferralLinkFeed_d8f7c5a4',
}

export async function FeedPageHeader({
  category,
  activeFilterPath,
}: {
  category: FeedCategory
  activeFilterPath: string
}) {
  const t = await getTranslations()
  const title = t(feedTitleLabels[category])
  // Feed pages are auth-only; breadcrumbs collapse to [] on the landing page
  // (intent landing path === activeFilterPath) and show [Intent, Title] on sub-filters
  const breadcrumbItems = buildBreadcrumbsForPath(activeFilterPath, {
    isAuthenticated: true,
    tail: [{ name: title, path: activeFilterPath }],
  })
  return (
    <div className='space-y-3'>
      <Breadcrumbs items={breadcrumbItems} />
      <h1
        data-pw='feed-page-heading'
        className='leading-none'
      >
        <TitleRouteDropdown
          label={title}
          items={[
            {
              label: t(feedTitleLabels.posts),
              href: feedRouteConfigs.posts.path,
              active: category === 'posts',
            },
            {
              label: t(feedTitleLabels.news),
              href: feedRouteConfigs.news.path,
              active: category === 'news',
            },
            {
              label: t(feedTitleLabels.podcasts),
              href: feedRouteConfigs.podcasts.path,
              active: category === 'podcasts',
            },
            {
              label: t(feedTitleLabels.videos),
              href: feedRouteConfigs.videos.path,
              active: category === 'videos',
            },
            {
              label: t(feedTitleLabels['referral-links']),
              href: feedRouteConfigs['referral-links'].path,
              active: category === 'referral-links',
            },
          ]}
        />
      </h1>
    </div>
  )
}
