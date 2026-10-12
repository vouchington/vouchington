'use client'

import { DomainsSection } from './domains-section'
import { SourceFeedSections } from './source-feed-sections'
import { useManageSourcePage } from './use-manage-source-page'
import type { ManageSourceState } from './manage-source-model'

export function ManageSourceClient({
  id,
  initialData,
}: {
  id: string
  initialData: Partial<ManageSourceState>
}) {
  const { handlers, state } = useManageSourcePage(id, initialData)

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
      <SourceFeedSections
        id={id}
        handlers={handlers}
        state={state}
      />
    </div>
  )
}
