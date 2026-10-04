'use client'

import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { CopyrightEuDisputeSettlementsPage } from '@/lib/api/client/copyright-territorial-redress'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { CopyrightStaffTerritorialReferralFields } from './copyright-staff-territorial-dispute-referral'
import { CopyrightStaffTerritorialDisputeList } from './copyright-staff-territorial-dispute-list'

export function CopyrightStaffTerritorialDispute({
  item,
  initialPage,
  pending,
  onReview,
}: {
  item: CopyrightStaffQueueItem
  initialPage: CopyrightEuDisputeSettlementsPage
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
      {territorial.decision ? (
        <CopyrightStaffTerritorialReferralFields
          item={item}
          onReview={onReview}
          pending={pending}
        />
      ) : null}
    </section>
  )
}
