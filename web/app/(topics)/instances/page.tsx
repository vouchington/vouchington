import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
  TopicListPage,
  type TopicListLoadOptions,
  type TopicListLoadResult,
} from '@/components/topics/topic-list-page'
import { getEffectiveServerFeatureFlag } from '@/lib/feature-flags/server'
import { topicRouteConfigs } from '@/lib/route-configs'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getFediverseInstances } from '@/lib/api/server/fediverse'

async function loadInstancesPage(options: TopicListLoadOptions): Promise<TopicListLoadResult> {
  const result = await getFediverseInstances(options)
  const nextPageEndpoint = result.usesDedicatedEndpoint
    ? '/api/v1/fediverse/instances'
    : '/api/v1/topics'
  return {
    data: result.data,
    nextPageEndpoint,
    nextPageParams: result.usesDedicatedEndpoint
      ? options.searchParams
      : { ...options.searchParams, topic_types: 'fediverse_instance' },
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createPageMetadata({
    title: t(topicRouteConfigs.instances.title),
    description: t(topicRouteConfigs.instances.description),
    path: '/instances',
  })
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function InstancesPage({ searchParams }: PageProps) {
  if (!(await getEffectiveServerFeatureFlag('fediverse'))) notFound()

  return (
    <TopicListPage
      config={topicRouteConfigs.instances}
      searchParams={searchParams}
      loadPage={loadInstancesPage}
      nextPageEndpoint='/api/v1/fediverse/instances'
      includeTopicTypeFilter={false}
      normalizeFediversePages
    />
  )
}
