'use client'

import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  listCopyrightEuStaffDisputeSettlements,
  type CopyrightEuDisputeSettlementsPage,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { CopyrightStaffTerritorialSettlementRecord } from './copyright-staff-territorial-dispute-record'

export function CopyrightStaffTerritorialDisputeList({
  item,
  initialPage,
  onReview,
  pending,
}: {
  item: CopyrightStaffQueueItem
  initialPage: CopyrightEuDisputeSettlementsPage
  onReview: SubmitReview
  pending: boolean
}) {
  const { pages, hasNextPage, loadingMore, fetchError, clearError, loadMore } = usePaginatedList(
    initialPage,
    `/api/v1/copyright-notices/${item.id}/eu-dispute-settlements/staff`,
    {},
    { loadPage: after => listCopyrightEuStaffDisputeSettlements(item.id, { after }) },
  )
  const settlementById = new Map<
    string,
    CopyrightEuDisputeSettlementsPage['copyright_eu_dispute_settlements'][number]
  >()
  for (const page of pages) {
    for (const settlement of page.copyright_eu_dispute_settlements) {
      settlementById.set(settlement.id, settlement)
    }
  }
  const settlements = [...settlementById.values()]
  return (
    <div className='space-y-3'>
      {settlements.map(referral => (
        <CopyrightStaffTerritorialSettlementRecord
          item={item}
          key={referral.id}
          onReview={onReview}
          pending={pending}
          referral={referral}
        />
      ))}
      <PaginatedListFooter
        fetchError={fetchError}
        canLoadMore={hasNextPage}
        loadingMore={loadingMore}
        clearError={clearError}
        loadMore={() => {
          void loadMore()
        }}
      />
    </div>
  )
}
