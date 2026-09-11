import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { ManageSourceRssFeed } from '@/components/topics/manage-source/manage-source-model'
import { getMembership, getServerRssFeedCrawls, getTopic, getTopicRssFeeds } from '@/lib/api/server'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createTopicPathname, topicHref } from '@/lib/links/entity-href'
import { canCurrentUserViewCrawlHistory } from '@/lib/permissions/can-view-crawl-history'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import {
  SourceCrawlsPage,
  type SourceCrawlSummary,
} from '@/components/topics/manage-source/source-crawls-page'

interface CrawlSubPageProps {
  params: Promise<{ id: string }>
}

export function createTopicSourceCrawlsPage() {
  async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations()
    return createNoIndexMetadata(
      t('extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5'),
    )
  }

  async function TopicSourceCrawlsRoutePage({ params }: CrawlSubPageProps) {
    const t = await getTranslations()
    const currentUser = await requireCurrentUser()
    const membership = currentUser.roles.includes('administrator')
      ? null
      : (await getMembership()).membership
    if (!canCurrentUserViewCrawlHistory(currentUser, membership)) notFound()

    const { id } = await params
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
    const crawls = rssFeed
      ? await getServerRssFeedCrawls<SourceCrawlSummary>(rssFeed.id, {
          searchParams: { limit: 20 },
        })
      : null

    const latestPath = topicHref(topic, 'latest')
    const sourcePath = topicHref(topic)

    return (
      <div>
        <nav
          aria-label={t('extracted.ui.breadcrumb.breadcrumb_d6dc6b5e')}
          className='mb-6 text-sm text-muted-foreground'
        >
          <Link
            href={sourcePath}
            prefetch={false}
            className='hover:underline'
          >
            {t('extracted.manageSource.sourceSection.source_0e570ca6')}
          </Link>
          {' / '}
          {t('extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5')}
        </nav>
        <div className='mb-6 flex items-center justify-between'>
          <h1
            className='text-xl font-semibold text-foreground'
            data-pw='source-crawls-heading'
          >
            {t('extracted.manageSource.crawlHistorySection.crawlHistory_a878daa5')}
          </h1>
          <Link
            href={latestPath}
            prefetch={false}
            className='text-sm text-primary hover:underline'
            data-pw='source-crawls-view-items'
          >
            {t('extracted.manageSource.crawlHistorySection.viewIngestedItems_c52d16e8')}
          </Link>
        </div>
        {crawls ? (
          <SourceCrawlsPage
            data={crawls}
            rssFeedId={rssFeed!.id}
            topic={topic}
          />
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.manageSource.crawlHistorySection.noCrawlsYet_12d0f59a')}
          </p>
        )}
      </div>
    )
  }

  return { generateMetadata, default: TopicSourceCrawlsRoutePage }
}
