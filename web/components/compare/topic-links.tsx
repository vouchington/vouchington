import Link from 'next/link'
import type { Topic, TopicMetrics } from '@/types/topics'
import type { Translator } from '@ts-shared/ui-messages'

interface TopicLinksProps {
  topic: Topic
  path: string
  metrics?: TopicMetrics
  t: Translator
}

export function TopicLinks({ topic, path, metrics, t }: TopicLinksProps) {
  const links = [
    {
      label: t('extracted.compare.topicLinks.reviews_84cb7871'),
      subpath: 'reviews',
      count: metrics?.count?.reviews ?? 0,
    },
    {
      label: t('extracted.compare.topicLinks.discussions_60157cfc'),
      subpath: 'discussions',
      count: metrics?.count?.discussions ?? 0,
    },
    {
      label: t('extracted.compare.topicLinks.dataPoints_1da65e3a'),
      subpath: 'data-points',
      count: metrics?.count?.['data-points'] ?? 0,
    },
  ].filter(l => l.count > 0)

  return (
    <div className='rounded-md border bg-card p-2 sm:p-4'>
      <h3 className='font-semibold'>{topic.name}</h3>
      {links.length > 0 ? (
        <ul className='mt-2 space-y-1'>
          {links.map(link => (
            <li key={link.subpath}>
              <Link
                href={`${path}/${link.subpath}`}
                prefetch={false}
                className='text-sm text-primary hover:underline'
              >
                {link.label} ({link.count})
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className='mt-2 text-sm text-muted-foreground'>
          {t('extracted.compare.topicLinks.noContentYet_6e0c3ebb')}
        </p>
      )}
    </div>
  )
}
