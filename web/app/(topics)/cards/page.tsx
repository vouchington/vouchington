import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(topicRouteConfigs.cards.title),
  description: defaultTranslator(topicRouteConfigs.cards.description),
  path: '/cards',
})

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
