import Link from 'next/link'
import { getTrendingTopics } from '@/lib/api/server'
import { Card } from '@/components/ui/card'
import { topicHref } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function TrendingTopicsAside() {
  const t = await getTranslations()
  const data = await getTrendingTopics({ searchParams: { limit: 5 } })
  const topics = data.results
    .slice(0, 5)
    .flatMap(r => (data.topics[r.id] ? [data.topics[r.id]!] : []))

  if (topics.length === 0) return null

  return (
    <Card className='p-4'>
      <h3
        data-pw='trending-topics-aside-heading'
        className='mb-2 text-sm font-semibold'
      >
        {t('extracted.asides.trendingTopicsAside.trendingTopics_e84e730e')}
      </h3>
      <ul className='space-y-1.5'>
        {topics.map(topic => (
          <li key={topic.id}>
            <Link
              href={topicHref(topic)}
              prefetch={false}
              className='text-sm text-primary hover:underline'
            >
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href='/topics'
        prefetch={false}
        className='mt-3 block text-xs text-muted-foreground hover:underline'
      >
        {t('extracted.asides.trendingTopicsAside.browseAllTopics_44e4ba00')}
      </Link>
    </Card>
  )
}
