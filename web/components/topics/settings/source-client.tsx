'use client'

import { CrawlHistorySection } from '@/components/topics/manage-source/crawl-history-section'
import { FeedActionsSection } from '@/components/topics/manage-source/feed-actions-section'
import { FeedMetadataSection } from '@/components/topics/manage-source/feed-metadata-section'
import { SourceSection } from '@/components/topics/manage-source/source-section'
import { useManageSourcePage } from '@/components/topics/manage-source/use-manage-source-page'
import type { ManageSourceState } from '@/components/topics/manage-source/manage-source-model'
import { createTopicPathname } from '@/lib/links/entity-href'

export function SourceClient({
  id,
  initialData,
}: {
  id: string
  initialData: Partial<ManageSourceState>
}) {
  const { handlers, state } = useManageSourcePage(id, initialData)

  const crawlsHref = createTopicPathname({ topic_type: 'rss_feed', id }, '/crawls')
  const crawlDetailHrefBase = createTopicPathname({ topic_type: 'rss_feed', id }, '/crawls/')
  const newsHref = createTopicPathname({ topic_type: 'rss_feed', id }, '/latest')

  if (state.loadError) {
    return (
      <div className='rounded-md bg-destructive/10 p-4'>
        <p className='text-sm text-destructive'>{state.loadError}</p>
      </div>
    )
  }

  return (
    <div
      data-pw='topic-settings-source'
      className='space-y-8'
    >
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
    </div>
  )
}
