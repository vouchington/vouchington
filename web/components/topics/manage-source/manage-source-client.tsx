'use client'

import { CrawlHistorySection } from './crawl-history-section'
import { DomainsSection } from './domains-section'
import { FeedActionsSection } from './feed-actions-section'
import { FeedMetadataSection } from './feed-metadata-section'
import { SourceSection } from './source-section'
import { useManageSourcePage } from './use-manage-source-page'
import type { ManageSourceState } from './manage-source-model'
import { createTopicPathname } from '@/lib/links/entity-href'

export function ManageSourceClient({
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
    <div className='space-y-8'>
      <DomainsSection
        additionalHostnames={state.additionalHostnames}
        addingHostname={state.addingHostname}
        onAddHostname={handlers.handleAddHostname}
        onPrimaryHostnameSubmit={handlers.handlePrimaryHostnameSubmit}
        onRemoveHostname={handlers.handleRemoveHostname}
        primaryHostname={state.primaryHostname}
        primaryHostnameSaving={state.primaryHostnameSaving}
        removingHostnameId={state.removingHostnameId}
        hasNextHostnamesPage={state.additionalHostnamesPageInfo.has_next_page}
        hostnamesEndCursor={state.additionalHostnamesPageInfo.end_cursor}
        onLoadMoreHostnames={handlers.handleLoadMoreHostnames}
        loadingMoreHostnames={state.loadingMoreHostnames}
        hostnamesFetchError={state.hostnamesFetchError}
        onClearHostnamesError={handlers.handleClearHostnamesError}
      />
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
