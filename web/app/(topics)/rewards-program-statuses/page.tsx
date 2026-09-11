import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(topicRouteConfigs['rewards-program-statuses'].title),
  description: defaultTranslator(topicRouteConfigs['rewards-program-statuses'].description),
  path: '/rewards-program-statuses',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function RewardsProgramStatusesPage({ searchParams }: PageProps) {
  return (
    <TopicListPage
      config={topicRouteConfigs['rewards-program-statuses']}
      searchParams={searchParams}
    />
  )
}
