import { feedRouteConfigData } from '@/lib/feed-route-config-data'
import { FeedNewsListPage } from '@/components/feed/feed-news-list-page'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createNoIndexMetadata(t(feedRouteConfigData['news/topics'].title))
}

export const dynamic = 'force-dynamic'

export default async function FeedNewsTopicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <FeedNewsListPage
      config={feedRouteConfigData['news/topics']}
      searchParams={await searchParams}
    />
  )
}
