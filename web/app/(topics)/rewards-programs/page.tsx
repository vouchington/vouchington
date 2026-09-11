import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(topicRouteConfigs['rewards-programs'].title),
  description: defaultTranslator(topicRouteConfigs['rewards-programs'].description),
  path: '/rewards-programs',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function RewardsProgramsPage({ searchParams }: PageProps) {
  return (
    <TopicListPage
      config={topicRouteConfigs['rewards-programs']}
      searchParams={searchParams}
    />
  )
}
