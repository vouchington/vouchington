'use client'

import { Button } from '@/components/ui/button'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type {
  CopyrightTerritorialClaimant,
  CopyrightTerritorialPoster,
} from '@/types/copyright-territorial'
import type { CopyrightEuDisputeSettlementsPage } from '@/lib/api/client/copyright-territorial-redress'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { CopyrightStaffTerritorialReferralFields } from './copyright-staff-territorial-dispute-referral'
import { CopyrightStaffTerritorialDisputeList } from './copyright-staff-territorial-dispute-list'

export function CopyrightStaffTerritorialDispute({
  item,
  initialPage,
  posters,
  claimants,
  recipientsComplete,
  recipientsStatus,
  onLoadRecipients,
  onRetryRecipients,
  pending,
  onReview,
}: {
  item: CopyrightStaffQueueItem
  initialPage: CopyrightEuDisputeSettlementsPage
  posters: readonly CopyrightTerritorialPoster[]
  claimants: readonly CopyrightTerritorialClaimant[]
  /** False until both lists reach their ends; a referral names a poster or the notifier. */
  recipientsComplete: boolean
  /** Where the walk through the remaining poster and claimant pages stands; it starts on request. */
  recipientsStatus: 'idle' | 'loading' | 'failed'
  onLoadRecipients: () => void
  onRetryRecipients: () => void
  pending: boolean
  onReview: SubmitReview
}) {
  const territorial = item.territorial
  if (!territorial || item.jurisdiction !== 'eu_dsa') return null
  return (
    <section
      aria-label='EU out-of-court dispute settlements'
      className='space-y-4'
      data-pw='copyright-staff-territorial-dispute'
    >
      <h3 className='font-semibold'>Out-of-court dispute settlement</h3>
      <p className='text-sm text-muted-foreground'>
        The body’s decision does not bind Voucha. Record any action separately.
      </p>
      <CopyrightStaffTerritorialDisputeList
        initialPage={initialPage}
        item={item}
        onReview={onReview}
        pending={pending}
      />
      {territorial.decision && !recipientsComplete ? (
        <RecipientsGate
          status={recipientsStatus}
          onLoad={onLoadRecipients}
          onRetry={onRetryRecipients}
        />
      ) : null}
      {territorial.decision && recipientsComplete ? (
        <CopyrightStaffTerritorialReferralFields
          item={item}
          onReview={onReview}
          pending={pending}
          posters={posters}
          claimants={claimants}
        />
      ) : null}
    </section>
  )
}

function RecipientsGate(props: {
  status: 'idle' | 'loading' | 'failed'
  onLoad: () => void
  onRetry: () => void
}) {
  if (props.status === 'idle') {
    return (
      <Button
        type='button'
        variant='outline'
        onClick={props.onLoad}
      >
        Record referral
      </Button>
    )
  }
  if (props.status === 'failed') {
    return (
      <div
        className='space-y-2'
        role='alert'
      >
        <p className='text-sm text-destructive'>
          The posters could not all be loaded, so a referral cannot be recorded yet.
        </p>
        <Button
          type='button'
          variant='outline'
          onClick={props.onRetry}
        >
          Retry
        </Button>
      </div>
    )
  }
  return (
    <p className='text-sm text-muted-foreground'>
      Loading every poster before a referral can be recorded…
    </p>
  )
}
