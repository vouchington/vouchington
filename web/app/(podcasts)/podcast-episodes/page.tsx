import type { Metadata } from 'next'
import { MediaItemListingPage } from '@/components/feed/media-item-listing-page'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { createPageMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createPageMetadata({
  title: 'Podcast Episodes',
  description: 'Latest podcast episodes from the sources you follow.',
  path: '/podcast-episodes',
})

export default async function PodcastEpisodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return MediaItemListingPage({
    searchParams,
    mediaType: 'audio',
    path: '/podcast-episodes',
    title: 'Podcast Episodes',
    description: 'Latest podcast episodes from the sources you follow.',
    routeKey: 'podcast-episodes',
    headerActions: () => <AddSourceButton kind='podcast' />,
  })
}
