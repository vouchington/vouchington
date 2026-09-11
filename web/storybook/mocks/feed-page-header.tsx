import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { TitleRouteDropdown } from '@/components/shared/title-route-dropdown'
import { feedRouteConfigs, type FeedCategory } from '@/lib/feed-route-configs'

// Storybook stub — the real FeedPageHeader is an async Server Component (calls
// getTranslations(), which reaches next/headers). React 19 cannot render async components
// client-side, so this mirrors the real synchronous JSX/labels for visual coverage instead
// of translating them.
const feedTitleLabels: Record<FeedCategory, string> = {
  posts: 'My Posts Feed',
  news: 'My News Feed',
  podcasts: 'My Podcast Episodes Feed',
  videos: 'My Video Feed',
  'referral-links': 'My Referral Link Feed',
}

export function FeedPageHeader({
  category,
  activeFilterPath,
}: {
  category: FeedCategory
  activeFilterPath: string
}) {
  const title = feedTitleLabels[category]
  return (
    <div className='space-y-3'>
      <Breadcrumbs items={[{ name: title, path: activeFilterPath }]} />
      <h1
        data-pw='feed-page-heading'
        className='leading-none'
      >
        <TitleRouteDropdown
          label={title}
          items={[
            {
              label: feedTitleLabels.posts,
              href: feedRouteConfigs.posts.path,
              active: category === 'posts',
            },
            {
              label: feedTitleLabels.news,
              href: feedRouteConfigs.news.path,
              active: category === 'news',
            },
            {
              label: feedTitleLabels.podcasts,
              href: feedRouteConfigs.podcasts.path,
              active: category === 'podcasts',
            },
            {
              label: feedTitleLabels.videos,
              href: feedRouteConfigs.videos.path,
              active: category === 'videos',
            },
            {
              label: feedTitleLabels['referral-links'],
              href: feedRouteConfigs['referral-links'].path,
              active: category === 'referral-links',
            },
          ]}
        />
      </h1>
    </div>
  )
}
