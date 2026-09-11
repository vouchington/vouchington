import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { FeedNewsListPage } from '@/components/feed/feed-news-list-page'
import { AddSourceButton } from '@/components/sources/add-source-button'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata: Metadata = createNoIndexMetadata(
  defaultTranslator(feedRouteConfigs['videos'].title),
)

export const dynamic = 'force-dynamic'

export default async function FeedVideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <FeedNewsListPage
      config={feedRouteConfigs['videos']}
      searchParams={await searchParams}
      action={<AddSourceButton kind='video' />}
    />
  )
}
