import { getTrendingTopics } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { TrendingTopicsAsideContent } from './trending-topics-aside-content'

export async function TrendingTopicsAside() {
  const t = await getTranslations()
  const data = await getTrendingTopics({ searchParams: { limit: 5 } })
  const topics = data.results
    .slice(0, 5)
    .flatMap(r => (data.topics[r.id] ? [data.topics[r.id]!] : []))

  return (
    <TrendingTopicsAsideContent
      heading={t('extracted.asides.trendingTopicsAside.trendingTopics_e84e730e')}
      browseLabel={t('extracted.asides.trendingTopicsAside.browseAllTopics_44e4ba00')}
      topics={topics.flatMap(topic =>
        topic.slug
          ? [{ id: topic.id, name: topic.name, topic_type: topic.topic_type, slug: topic.slug }]
          : [],
      )}
    />
  )
}
