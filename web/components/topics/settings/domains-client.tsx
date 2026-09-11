'use client'

import { DomainsSection } from '@/components/topics/manage-source/domains-section'
import { useManageSourcePage } from '@/components/topics/manage-source/use-manage-source-page'
import type { ManageSourceState } from '@/components/topics/manage-source/manage-source-model'

export function DomainsClient({
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
    <div
      data-pw='topic-settings-domains'
      className='space-y-8'
    >
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
    </div>
  )
}
