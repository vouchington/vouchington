import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { FeedNewsListPage } from '@/components/feed/feed-news-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata: Metadata = createNoIndexMetadata(
  defaultTranslator(feedRouteConfigs['videos/topics'].title),
)

export const dynamic = 'force-dynamic'

export default async function FeedVideosTopicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <FeedNewsListPage
      config={feedRouteConfigs['videos/topics']}
      searchParams={await searchParams}
    />
  )
}
