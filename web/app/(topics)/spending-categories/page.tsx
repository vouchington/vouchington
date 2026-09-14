import type { Metadata } from 'next'
import { TopicListPage } from '@/components/topics/topic-list-page'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createPageMetadata({
    title: t(topicRouteConfigs['spending-categories'].title),
    description: t(topicRouteConfigs['spending-categories'].description),
    path: '/spending-categories',
  })
}

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
