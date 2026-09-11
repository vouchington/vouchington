import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  computeCrawlOutcome,
  extractFeedItemUrl,
  responseCodeClass,
} from '@/components/topics/manage-source/crawl-outcome'
import type { ManageSourceRssFeed } from '@/components/topics/manage-source/manage-source-model'
import { getMembership, getServerRssFeedCrawl, getTopic, getTopicRssFeeds } from '@/lib/api/server'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createTopicPathname, topicHref } from '@/lib/links/entity-href'
import { canCurrentUserViewCrawlHistory } from '@/lib/permissions/can-view-crawl-history'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import {
  createSourceCrawlFeedItemKey,
  getCrawlOutcomeBackgroundClass,
  getCrawlOutcomeMessage,
} from './topic-source-crawl-detail-helpers'

interface CrawlDetailSubPageProps {
  params: Promise<{ id: string; crawlId: string }>
}

type SourceCrawlDetail = {
  id: string
  response_code: number
  created_at: string
  feed_data?: Record<string, unknown> | null
  feed_data_sha256?: string | null
  redirect_url_id?: string | null
}

export function createTopicSourceCrawlDetailPage() {
  async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations()
    return createNoIndexMetadata(t('extracted.crawlid.page.crawlDetails_aa7bec3e'))
  }

  async function TopicSourceCrawlDetailRoutePage({ params }: CrawlDetailSubPageProps) {
    const t = await getTranslations()
    const currentUser = await requireCurrentUser()
    const membership = currentUser.roles.includes('administrator')
      ? null
      : (await getMembership()).membership
    if (!canCurrentUserViewCrawlHistory(currentUser, membership)) notFound()

    const { id, crawlId } = await params
    const [topicData, feedData] = await Promise.all([
      getTopic(id),
      getTopicRssFeeds<ManageSourceRssFeed>(id, {
        enabled: null,
        discoverable: null,
      }),
    ])
    if (!topicData) notFound()
    const topic = topicData.topic
    if (topic.topic_type !== 'rss_feed') notFound()

    const rssFeed = feedData.results[0] ?? null
    if (!rssFeed) notFound()

    const crawlData = await getServerRssFeedCrawl<{ crawl: SourceCrawlDetail }>(rssFeed.id, crawlId)
    if (!crawlData) notFound()
    const { crawl } = crawlData

    const crawlsPath = createTopicPathname(topic, '/crawls')
    const latestPath = topicHref(topic, 'latest')
    const outcome = computeCrawlOutcome(crawl.response_code, crawl.feed_data)
    const outcomeMessage = getCrawlOutcomeMessage(outcome)

    const outcomeBgClass = getCrawlOutcomeBackgroundClass(outcome.tone)

    const rawFeedItems = crawl.feed_data?.items ?? crawl.feed_data?.entries
    const feedItems = Array.isArray(rawFeedItems) ? (rawFeedItems as Record<string, unknown>[]) : []

    return (
      <div>
        <nav
          aria-label={t('extracted.ui.breadcrumb.breadcrumb_d6dc6b5e')}
          className='mb-6 text-sm text-muted-foreground'
        >
          <Link
            href={crawlsPath}
            prefetch={false}
            className='hover:underline'
          >
            {t('extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5')}
          </Link>
          {' / '}
          {t('extracted.crawlid.page.crawlDetails_aa7bec3e')}
        </nav>
        <div className='mb-6 flex items-center justify-between'>
          <h1
            className='text-xl font-semibold text-foreground'
            data-pw='source-crawl-detail-heading'
          >
            {t('extracted.crawlid.page.crawlDetails_aa7bec3e')}
          </h1>
          <Link
            href={latestPath}
            prefetch={false}
            className='text-sm text-primary hover:underline'
            data-pw='source-crawl-detail-view-items'
          >
            {t('extracted.manageSource.crawlHistorySection.viewIngestedItems_c52d16e8')}
          </Link>
        </div>
        <div
          className={`mb-6 rounded-md px-4 py-3 text-sm font-medium ${outcomeBgClass}`}
          data-pw='source-crawl-outcome-banner'
        >
          {t(outcomeMessage.key, outcomeMessage.values)}
        </div>
        <div className='mb-6 overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
          <div className='px-6 py-5'>
            <h2 className='text-lg font-medium text-foreground'>
              {t('extracted.crawlid.page.crawlInformation_13f65660')}
            </h2>
          </div>
          <div className='border-t px-6 py-5'>
            <dl className='grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2'>
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.manageSource.crawlHistorySection.responseCode_c7992dd3')}
                </dt>
                <dd className='mt-1 text-sm text-foreground'>
                  <span className={responseCodeClass(crawl.response_code)}>
                    {crawl.response_code}
                  </span>
                </dd>
              </div>
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.crawlid.page.createdAt_3d443370')}
                </dt>
                <dd
                  className='mt-1 text-sm text-foreground'
                  suppressHydrationWarning
                >
                  {new Date(crawl.created_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        {feedItems.length > 0 && (
          <div className='overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
            <div className='px-6 py-5'>
              <h2 className='text-lg font-medium text-foreground'>
                {t('extracted.manageSource.crawlHistorySection.parsedItems_dbd0488c', {
                  count: feedItems.length,
                })}
              </h2>
            </div>
            <div className='border-t'>
              <ul
                className='divide-y divide-border'
                data-pw='source-crawl-feed-items'
              >
                {feedItems.map((item, i) => {
                  const title =
                    typeof item['title'] === 'string'
                      ? item['title']
                      : t('extracted.manageSource.crawlHistorySection.itemNumber_49d8f8b4', {
                          number: i + 1,
                        })
                  const url = extractFeedItemUrl(item, rssFeed.rss_feed_url.url)
                  return (
                    <li
                      key={createSourceCrawlFeedItemKey(item, url)}
                      className='px-6 py-4 text-sm'
                    >
                      {url ? (
                        <a
                          href={url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='font-medium text-primary hover:underline'
                        >
                          {title}
                        </a>
                      ) : (
                        <span className='font-medium text-foreground'>{title}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
    )
  }

  return { generateMetadata, default: TopicSourceCrawlDetailRoutePage }
}
