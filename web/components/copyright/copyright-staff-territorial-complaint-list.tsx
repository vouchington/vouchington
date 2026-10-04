'use client'

import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  listCopyrightTerritorialComplaints,
  type CopyrightTerritorialComplaintsPage,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { CopyrightStaffTerritorialComplaintReview } from './copyright-staff-territorial-complaint-review'

export function CopyrightStaffTerritorialComplaintList({
  item,
  initialPage,
  onReview,
  pending,
}: {
  item: CopyrightStaffQueueItem
  initialPage: CopyrightTerritorialComplaintsPage
  onReview: SubmitReview
  pending: boolean
}) {
  const { pages, hasNextPage, loadingMore, fetchError, clearError, loadMore } = usePaginatedList(
    initialPage,
    `/api/v1/copyright-notices/${item.id}/territorial-complaints`,
    {},
    { loadPage: after => listCopyrightTerritorialComplaints(item.id, { after }) },
  )
  const complaintById = new Map<
    string,
    CopyrightTerritorialComplaintsPage['copyright_territorial_complaints'][number]
  >()
  for (const page of pages) {
    for (const complaint of page.copyright_territorial_complaints) {
      complaintById.set(complaint.id, complaint)
    }
  }
  const complaints = [...complaintById.values()]
  return (
    <div className='space-y-3'>
      {complaints.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No complaints have been filed.</p>
      ) : (
        complaints.map(complaint => (
          <CopyrightStaffTerritorialComplaintReview
            complaint={complaint}
            item={item}
            key={complaint.id}
            onReview={onReview}
            pending={pending}
          />
        ))
      )}
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
