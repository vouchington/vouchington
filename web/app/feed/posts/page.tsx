import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { FeedPostListPage } from '@/components/feed/feed-post-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata: Metadata = createNoIndexMetadata(
  defaultTranslator(feedRouteConfigs['posts'].title),
)

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FeedPostsPage({ searchParams }: Props) {
  return (
    <FeedPostListPage
      config={feedRouteConfigs['posts']}
      searchParams={searchParams}
    />
  )
}
