'use client'

import { BloomFilterRebuildCard } from './bloom-filter-rebuild-card'
import { CacheManagementCard } from './cache-management-card'
import { FlushConcernsCard } from './flush-concerns-card'
import { ValkeyConfirmDialog } from './valkey-confirm-dialog'
import { ValkeyHeader } from './valkey-header'
import { ValkeyErrorState, ValkeyInlineError, ValkeyLoadingState } from './valkey-load-state'
import { useValkeyAdminState } from './valkey-state'

export default function ValkeyPage() {
  const state = useValkeyAdminState()

  if (state.loading && state.cacheGroups.length === 0) {
    return <ValkeyLoadingState />
  }

  if (state.error && state.cacheGroups.length === 0) {
    return <ValkeyErrorState error={state.error} />
  }

  return (
    <div>
      <ValkeyHeader
        loadData={state.loadData}
        loading={state.loading}
      />
      {state.error && <ValkeyInlineError error={state.error} />}
      <BloomFilterRebuildCard
        rebuildLoading={state.rebuildLoading}
        setPendingAction={state.setPendingAction}
      />
      <CacheManagementCard
        cacheGroups={state.cacheGroups}
        clearLoading={state.clearLoading}
        setPendingAction={state.setPendingAction}
      />
      <FlushConcernsCard
        flushLoading={state.flushLoading}
        setPendingAction={state.setPendingAction}
      />
      <ValkeyConfirmDialog
        confirmAction={state.confirmAction}
        pendingAction={state.pendingAction}
        setPendingAction={state.setPendingAction}
      />
    </div>
  )
}
