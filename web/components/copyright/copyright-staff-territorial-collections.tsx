'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  listCopyrightEuStaffDisputeSettlements,
  listCopyrightTerritorialClaimants,
  listCopyrightTerritorialComplaints,
  listCopyrightTerritorialPosters,
  type CopyrightEuDisputeSettlementsPage,
  type CopyrightTerritorialClaimantsPage,
  type CopyrightTerritorialComplaintsPage,
  type CopyrightTerritorialPostersPage,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffTerritorialComplaintList } from './copyright-staff-territorial-complaint-list'
import { CopyrightStaffTerritorialDispute } from './copyright-staff-territorial-dispute'
import { CopyrightStaffTerritorialPosters } from './copyright-staff-territorial-posters'
import { useWalkToEnd } from './copyright-staff-territorial-walk'
import type { SubmitReview } from './copyright-staff-review-buttons'

type Props = {
  item: CopyrightStaffQueueItem
  pending: boolean
  onReview: SubmitReview
  onClose: () => void
}
type FirstPages = {
  posters: CopyrightTerritorialPostersPage
  claimants: CopyrightTerritorialClaimantsPage
  complaints: CopyrightTerritorialComplaintsPage
  settlements: CopyrightEuDisputeSettlementsPage | null
}

/**
 * The posters, claimants, complaints and settlements of a territorial case, in a dialog. The queue card only
 * counts them, so the parent mounts this while the dialog is open and the first pages load then.
 */
export function CopyrightStaffTerritorialCollections(props: Props) {
  const { id, jurisdiction } = props.item
  const [pages, setPages] = useState<FirstPages | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    void Promise.all([
      listCopyrightTerritorialPosters(id),
      listCopyrightTerritorialClaimants(id),
      listCopyrightTerritorialComplaints(id),
      jurisdiction === 'eu_dsa' ? listCopyrightEuStaffDisputeSettlements(id) : null,
    ])
      .then(([posters, claimants, complaints, settlements]) => {
        if (current) setPages({ posters, claimants, complaints, settlements })
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [id, jurisdiction])
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        className='max-h-[90vh] overflow-y-auto'
        data-pw='copyright-staff-territorial-details-dialog'
      >
        <DialogHeader>
          <DialogTitle>Deliveries, complaints and settlements</DialogTitle>
          <DialogDescription>
            Poster delivery status, complaints and dispute settlements for this case.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p
            className='text-sm text-destructive'
            role='alert'
          >
            The case details could not be loaded.
          </p>
        ) : pages ? (
          <LoadedCollections
            {...props}
            pages={pages}
          />
        ) : (
          <Spinner />
        )}
      </DialogContent>
    </Dialog>
  )
}

function LoadedCollections({ item, pending, onReview, pages }: Props & { pages: FirstPages }) {
  const posterList = usePaginatedList(
    pages.posters,
    `/api/v1/copyright-notices/${item.id}/territorial-posters`,
    {},
    { loadPage: after => listCopyrightTerritorialPosters(item.id, { after }) },
  )
  const claimantList = usePaginatedList(
    pages.claimants,
    `/api/v1/copyright-notices/${item.id}/territorial-claimants`,
    {},
    { loadPage: after => listCopyrightTerritorialClaimants(item.id, { after }) },
  )
  // A referral names a poster and the notifier, so both lists load to their ends before the form
  // appears. The walk starts only when staff ask to record a referral: each poster page computes
  // parties for its batch of targets, so reading every page is not free. Retry only clears the
  // errors; the walk then continues, so a retry never starts a second load beside it.
  const [walking, setWalking] = useState(false)
  useWalkToEnd(posterList, walking)
  useWalkToEnd(claimantList, walking)
  const failed = !!posterList.fetchError || !!claimantList.fetchError
  const status = !walking ? 'idle' : failed ? 'failed' : 'loading'
  const posters = posterList.pages.flatMap(page => page.copyright_territorial_posters)
  const claimants = claimantList.pages.flatMap(page => page.copyright_territorial_claimants)
  return (
    <>
      <CopyrightStaffTerritorialPosters
        posters={posters}
        fetchError={posterList.fetchError}
        hasNextPage={posterList.hasNextPage}
        loadingMore={posterList.loadingMore}
        clearError={posterList.clearError}
        loadMore={() => {
          void posterList.loadMore()
        }}
      />
      <section
        aria-label='Territorial complaints'
        className='space-y-4'
        data-pw='copyright-staff-territorial-redress'
      >
        <h3 className='font-semibold'>Complaints</h3>
        <CopyrightStaffTerritorialComplaintList
          item={item}
          initialPage={pages.complaints}
          onReview={onReview}
          pending={pending}
        />
      </section>
      {pages.settlements ? (
        <CopyrightStaffTerritorialDispute
          initialPage={pages.settlements}
          item={item}
          onReview={onReview}
          pending={pending}
          posters={posters}
          claimants={claimants}
          recipientsComplete={!posterList.hasNextPage && !claimantList.hasNextPage}
          recipientsStatus={status}
          onLoadRecipients={() => setWalking(true)}
          onRetryRecipients={() => {
            posterList.clearError()
            claimantList.clearError()
          }}
        />
      ) : null}
    </>
  )
}
