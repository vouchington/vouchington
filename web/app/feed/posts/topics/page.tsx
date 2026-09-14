import { feedRouteConfigs } from '@/lib/feed-route-configs'
import { FeedPostListPage } from '@/components/feed/feed-post-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createNoIndexMetadata(t(feedRouteConfigs['posts/topics'].title))
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FeedPostsTopicsPage({ searchParams }: Props) {
  return (
    <FeedPostListPage
      config={feedRouteConfigs['posts/topics']}
      searchParams={searchParams}
    />
  )
}
