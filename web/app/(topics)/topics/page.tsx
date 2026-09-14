import type { Metadata } from 'next'
import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createPageMetadata({
    title: t(topicRouteConfigs.topics.title),
    description: t(topicRouteConfigs.topics.description),
    path: '/topics',
  })
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function TopicsPage({ searchParams }: PageProps) {
  return (
    <TopicListPage
      config={topicRouteConfigs.topics}
      searchParams={searchParams}
    />
  )
}
