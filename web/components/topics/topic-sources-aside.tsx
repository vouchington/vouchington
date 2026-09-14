import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { domainHref } from '@/lib/links/entity-href'
import type { getTranslations } from '@/lib/i18n/get-translations'
import type { RssFeedsListResponseBody } from '@/types/api-responses'
import type { HostnameListResponse } from '@/types/hostnames'

interface TopicSourcesAsideProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  rssFeeds: RssFeedsListResponseBody
  hostnames: HostnameListResponse
}

export function TopicSourcesAside({ t, rssFeeds, hostnames }: TopicSourcesAsideProps) {
  if (rssFeeds.results.length === 0 && hostnames.results.length === 0) return null

  const firstFeed = rssFeeds.results[0]

  return (
    <Card className='p-4 space-y-3'>
      {firstFeed && (
        <div>
          <h3 className='text-sm font-semibold mb-1'>
            {t('extracted.topics.topicSourcesAside.source_0e570ca6')}
          </h3>
          {firstFeed.hostname ? (
            <Link
              href={domainHref(firstFeed.hostname)}
              prefetch={false}
              className='text-sm font-medium hover:underline'
            >
              {firstFeed.title}
            </Link>
          ) : (
            <span className='text-sm font-medium'>{firstFeed.title}</span>
          )}
        </div>
      )}
      {hostnames.results.length > 0 && (
        <div>
          <h3 className='text-sm font-semibold mb-1'>
            {t('extracted.topics.topicSourcesAside.domains_ced67718')}
          </h3>
          <ul className='space-y-1'>
            {hostnames.results.slice(0, 6).map(ref => {
              const hostname = hostnames.hostnames[ref.id]
              if (!hostname) return null
              return (
                <li key={ref.id}>
                  <Link
                    href={domainHref(hostname)}
                    prefetch={false}
                    className='text-sm font-medium hover:underline'
                  >
                    {hostname.hostname}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}
