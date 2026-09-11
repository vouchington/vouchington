'use client'

import type { StatusFilter, VoteIntegrityFlagsResponse } from '@/types/vote-integrity'
import { useVoteIntegrityFlags } from './use-vote-integrity-flags'
import { VoteIntegrityFlagsHeader } from './vote-integrity-flags-header'
import { VoteIntegrityFlagsTable } from './vote-integrity-flags-table'

export function VoteIntegrityFlagsClient({
  initialData,
  initialStatus,
}: {
  initialData: VoteIntegrityFlagsResponse
  initialStatus: StatusFilter
}) {
  return (
    <VoteIntegrityFlagsClientInner
      key={initialStatus}
      initialData={initialData}
      initialStatus={initialStatus}
    />
  )
}

function VoteIntegrityFlagsClientInner({
  initialData,
  initialStatus,
}: {
  initialData: VoteIntegrityFlagsResponse
  initialStatus: StatusFilter
}) {
  const state = useVoteIntegrityFlags(initialData, initialStatus)

  return (
    <div>
      <VoteIntegrityFlagsHeader
        isPending={state.isPending}
        onRefresh={state.handleRefreshFlags}
        onStatusChange={state.handleStatusChange}
        selectedStatus={state.selectedStatus}
      />

      <VoteIntegrityFlagsTable
        {...state}
        initialStatus={initialStatus}
      />
    </div>
  )
}
