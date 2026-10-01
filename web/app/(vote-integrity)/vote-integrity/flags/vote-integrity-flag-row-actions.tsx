'use client'

import {
  IntegrityFlagResolvedActor,
  IntegrityFlagUnresolvedActions,
} from '@/components/admin/integrity-flag-action-row'
import type { FlagResolution, VoteIntegrityFlag } from '@/types/vote-integrity'
import { ApplyPenaltyButton, ResolveFlagButton } from './vote-integrity-flag-actions'
import type { VoteIntegrityFlagsTableProps } from './vote-integrity-flags-table-props'

type FlagActionProps = {
  flag: VoteIntegrityFlag
  state: VoteIntegrityFlagsTableProps
}

export function VoteIntegrityFlagActions({ flag, state }: FlagActionProps) {
  if (flag.resolved_at) {
    return (
      <IntegrityFlagResolvedActor
        resolvedAt={flag.resolved_at}
        resolvedById={flag.resolved_by_id}
      />
    )
  }
  return (
    <IntegrityFlagUnresolvedActions
      domain='vote'
      resolution={state.resolutions[flag.id] ?? ''}
      onResolutionChange={value => state.updateResolution(flag.id, value as FlagResolution)}
      actions={
        <>
          <ResolveFlagButton
            flag={flag}
            state={state}
          />
          <ApplyPenaltyButton
            flag={flag}
            state={state}
          />
        </>
      }
      error={state.actionErrors[flag.id]}
      reconciliationRequired={state.reconciliationRequired[flag.id]}
      onRetryReconciliation={() => {
        void state.retryReconciliation(flag.id)
      }}
    />
  )
}
