'use client'

import { IntegrityPenaltiesClient } from '@/components/admin/integrity-penalties-client'
import {
  getVoteIntegrityPenaltyClient,
  revokeVoteWeightPenalty,
  getVoteWeightPenaltyReviewsDue,
  reviewVoteWeightPenalty,
} from '@/lib/api/client/vote-integrity'
import type {
  IntegrityPenaltyStatusFilter,
  VoteIntegrityPenaltyReviewsDueResponse,
  VoteIntegrityPenaltiesResponse,
  VoteIntegrityPenalty,
} from '@/types/vote-integrity'
import { hasConfirmedFlagScope } from './vote-integrity-penalties-scope'

export function VoteIntegrityPenaltiesClient({
  initialData,
  initialDuePage,
  initialStatus,
}: {
  initialDuePage: VoteIntegrityPenaltyReviewsDueResponse | null
  initialData: VoteIntegrityPenaltiesResponse
  initialStatus: IntegrityPenaltyStatusFilter
}) {
  return (
    <IntegrityPenaltiesClient<VoteIntegrityPenalty>
      domain='vote'
      endpoint='/api/v1/vote-integrity/penalties'
      flagsPath='/vote-integrity/flags'
      getById={getVoteIntegrityPenaltyClient}
      initialData={initialData}
      initialStatus={initialStatus}
      multiplier={penalty => String(penalty.penalty_multiplier)}
      paginationParams={{ source: 'flag' }}
      penaltiesPath='/vote-integrity/penalties'
      revoke={revokeVoteWeightPenalty}
      annualReviews={
        initialDuePage
          ? {
              initialDuePage,
              getDue: getVoteWeightPenaltyReviewsDue,
              review: reviewVoteWeightPenalty,
            }
          : undefined
      }
      scopeGuard={hasConfirmedFlagScope}
    />
  )
}
