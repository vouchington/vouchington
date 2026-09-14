import type { Metadata } from 'next'
import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createPageMetadata({
    title: t(topicRouteConfigs.cards.title),
    description: t(topicRouteConfigs.cards.description),
    path: '/cards',
  })
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function CardsPage({ searchParams }: PageProps) {
  return (
    <TopicListPage
      config={topicRouteConfigs.cards}
      searchParams={searchParams}
    />
  )
}
