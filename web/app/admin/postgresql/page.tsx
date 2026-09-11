'use client'

import { PartitionConfirmDialog } from './partition-confirm-dialog'
import { PostgreSQLActionsCard } from './postgresql-actions-card'
import { PostgreSQLHeader } from './postgresql-header'
import {
  PostgreSQLInlineError,
  PostgreSQLLoadingState,
  PostgreSQLErrorState,
} from './postgresql-load-state'
import { PostgreSQLStatusCards } from './postgresql-status-cards'
import { usePostgreSQLAdminState } from './postgresql-state'
import { SyncArticlesCard } from './sync-articles-card'

export default function PostgreSQLPage() {
  const state = usePostgreSQLAdminState()

  if (state.loading && !state.status) return <PostgreSQLLoadingState />
  if (state.error && !state.status) return <PostgreSQLErrorState error={state.error} />

  return (
    <div>
      <PostgreSQLHeader
        loadData={state.loadData}
        loading={state.loading}
      />
      {state.error && <PostgreSQLInlineError error={state.error} />}
      <PostgreSQLStatusCards status={state.status} />
      <PostgreSQLActionsCard
        actionLoading={state.actionLoading}
        onAction={state.handleAction}
        setPendingAction={state.setPendingAction}
      />
      <SyncArticlesCard />
      <PartitionConfirmDialog
        confirmPartitionAction={state.confirmPartitionAction}
        pendingAction={state.pendingAction}
        setPendingAction={state.setPendingAction}
      />
    </div>
  )
}
