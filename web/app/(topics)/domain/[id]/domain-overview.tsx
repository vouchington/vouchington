import Link from 'next/link'
import { topicHref } from '@/lib/links/entity-href'
import type { ViewRssFeed } from '@/types/rss-feeds'
import { getTranslations } from '@/lib/i18n/get-translations'

interface DomainOverviewProps {
  rss_feeds: ViewRssFeed[]
  top_urls: Array<{ id: string; url: string; pathname: string }>
}

export async function DomainOverview({ rss_feeds, top_urls }: DomainOverviewProps) {
  const t = await getTranslations()
  return (
    <div className='space-y-4'>
      {rss_feeds.length > 0 && (
        <section className='space-y-3'>
          <h2 className='text-lg font-semibold tracking-tight'>
            {t('extracted.id.domainOverview.sources_caf85b08')}
          </h2>
          <div className='space-y-3'>
            {rss_feeds.map(feed => (
              <article
                key={feed.id}
                className='rounded-md border bg-card p-4'
              >
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='font-medium'>{feed.title}</p>
                    <p className='text-sm text-muted-foreground'>
                      <a
                        href={feed.rss_feed_url.url}
                        target='_blank'
                        rel='nofollow noopener noreferrer'
                        className='hover:underline'
                      >
                        {feed.rss_feed_url.url}
                      </a>
                    </p>
                  </div>
                  <Link
                    href={topicHref(feed.topic, 'latest')}
                    className='text-sm text-primary hover:underline'
                  >
                    {t('extracted.id.domainOverview.openFeed_6b535fbe')}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className='space-y-3'>
        <h2
          className='text-lg font-semibold tracking-tight'
          data-pw='domain-detail-top-urls-heading'
        >
          {t('extracted.id.domainOverview.topUrls_e9cd7386')}
        </h2>
        <div className='rounded-md border bg-card'>
          {top_urls.length === 0 ? (
            <p className='p-4 text-sm text-muted-foreground'>
              {t('extracted.id.domainOverview.noUrlsAvailableForThisDomain_4e9028d7')}
            </p>
          ) : (
            <ul className='divide-y'>
              {top_urls.map(url => (
                <li
                  key={url.id}
                  className='p-4'
                >
                  <a
                    href={url.url}
                    target='_blank'
                    rel='nofollow noopener noreferrer'
                    className='font-medium hover:underline'
                  >
                    {url.pathname || url.url}
                  </a>
                  <p className='mt-1 text-sm text-muted-foreground'>{url.url}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
