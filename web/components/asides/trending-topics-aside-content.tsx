import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { topicHref } from '@/lib/links/entity-href'

export function TrendingTopicsAsideContent({
  heading,
  browseLabel,
  topics,
}: {
  heading: string
  browseLabel: string
  topics: Array<{ id: string; name: string; topic_type: string; slug?: string | null }>
}) {
  if (topics.length === 0) return null

  return (
    <Card className='p-4'>
      <h3
        data-pw='trending-topics-aside-heading'
        className='mb-2 text-sm font-semibold'
      >
        {heading}
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
        {browseLabel}
      </Link>
    </Card>
  )
}
