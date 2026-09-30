import type { Metadata } from 'next'
import { MediaItemListingPage } from '@/components/feed/media-item-listing-page'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { createPageMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createPageMetadata({
  title: 'News',
  description: 'Latest news from across the web on the topics you follow.',
  path: '/news',
})

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return MediaItemListingPage({
    searchParams,
    mediaType: 'article',
    path: '/news',
    title: 'News',
    description: 'Latest news from across the web on the topics you follow.',
    routeKey: 'news',
    includeTopics: true,
    dataPw: 'localization-tmux-smoke-news-page',
    headerActions: () => <AddSourceButton kind='news' />,
  })
}
