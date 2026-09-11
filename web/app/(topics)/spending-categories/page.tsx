import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'

export const metadata = createPageMetadata({
  title: defaultTranslator(topicRouteConfigs['spending-categories'].title),
  description: defaultTranslator(topicRouteConfigs['spending-categories'].description),
  path: '/spending-categories',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function SpendingCategoriesPage({ searchParams }: PageProps) {
  return (
    <TopicListPage
      config={topicRouteConfigs['spending-categories']}
      searchParams={searchParams}
    />
  )
}
