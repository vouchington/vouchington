'use client'

import { CrawlHistorySection } from './crawl-history-section'
import { FeedActionsSection } from './feed-actions-section'
import { FeedMetadataSection } from './feed-metadata-section'
import { SourceSection } from './source-section'
import { useManageSourcePage } from './use-manage-source-page'
import { createTopicPathname } from '@/lib/links/entity-href'

type ManageSourcePage = ReturnType<typeof useManageSourcePage>

export function SourceFeedSections({
  id,
  handlers,
  state,
}: {
  id: string
  handlers: ManageSourcePage['handlers']
  state: ManageSourcePage['state']
}) {
  const crawlsHref = createTopicPathname({ topic_type: 'rss_feed', id }, '/crawls')
  const crawlDetailHrefBase = createTopicPathname({ topic_type: 'rss_feed', id }, '/crawls/')
  const newsHref = createTopicPathname({ topic_type: 'rss_feed', id }, '/latest')

  return (
    <>
      <SourceSection
        onSubmit={handlers.handleSubmit}
        rssFeed={state.rssFeed}
        saving={state.saving}
      />
      {state.rssFeed && (
        <>
          <FeedActionsSection
            confirmDelete={state.confirmDelete}
            deleting={state.deleting}
            onConfirmDeleteChange={handlers.handleConfirmDeleteChange}
            onDelete={handlers.handleDelete}
            onRefresh={handlers.handleRefresh}
            onToggle={handlers.handleToggle}
            onToggleDiscoverability={handlers.handleToggleDiscoverability}
            refreshing={state.refreshing}
            rssFeed={state.rssFeed}
            toggling={state.toggling}
            togglingDiscoverability={state.togglingDiscoverability}
          />
          <FeedMetadataSection rssFeed={state.rssFeed} />
          <CrawlHistorySection
            crawls={state.crawls}
            crawlsHref={crawlsHref}
            crawlDetailHrefBase={crawlDetailHrefBase}
            newsHref={newsHref}
          />
        </>
      )}
    </>
  )
}
