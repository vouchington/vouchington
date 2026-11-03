'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  listCopyrightEuStaffDisputeSettlements,
  listCopyrightTerritorialComplaints,
  listCopyrightTerritorialRecipients,
  type CopyrightEuDisputeSettlementsPage,
  type CopyrightTerritorialComplaintsPage,
  type CopyrightTerritorialRecipientsPage,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffTerritorialComplaintList } from './copyright-staff-territorial-complaint-list'
import { CopyrightStaffTerritorialDispute } from './copyright-staff-territorial-dispute'
import type { SubmitReview } from './copyright-staff-review-buttons'

type Props = {
  item: CopyrightStaffQueueItem
  pending: boolean
  onReview: SubmitReview
  onClose: () => void
}
type FirstPages = {
  recipients: CopyrightTerritorialRecipientsPage
  complaints: CopyrightTerritorialComplaintsPage
  settlements: CopyrightEuDisputeSettlementsPage | null
}

/**
 * The recipients, complaints and settlements of a territorial case, in a dialog. The queue card only
 * counts them, so the parent mounts this while the dialog is open and the first pages load then.
 */
export function CopyrightStaffTerritorialCollections(props: Props) {
  const { id, jurisdiction } = props.item
  const [pages, setPages] = useState<FirstPages | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    void Promise.all([
      listCopyrightTerritorialRecipients(id),
      listCopyrightTerritorialComplaints(id),
      jurisdiction === 'eu_dsa' ? listCopyrightEuStaffDisputeSettlements(id) : null,
    ])
      .then(([recipients, complaints, settlements]) => {
        if (current) setPages({ recipients, complaints, settlements })
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
        aria-describedby={undefined}
        className='max-h-[90vh] overflow-y-auto'
        data-pw='copyright-staff-territorial-details-dialog'
      >
        <DialogHeader>
          <DialogTitle>Deliveries, complaints and settlements</DialogTitle>
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
  const recipientList = usePaginatedList(
    pages.recipients,
    `/api/v1/copyright-notices/${item.id}/territorial-recipients`,
    {},
    { loadPage: after => listCopyrightTerritorialRecipients(item.id, { after }) },
  )
  const { hasNextPage, loadingMore, fetchError, loadMore } = recipientList
  // A referral names one poster from this list, so every page loads before the form appears.
  useEffect(() => {
    if (hasNextPage && !loadingMore && !fetchError) void loadMore()
  }, [hasNextPage, loadingMore, fetchError, loadMore])
  const recipients = recipientList.pages.flatMap(page => page.copyright_territorial_recipients)
  const posterRecipients = recipients.filter(recipient => recipient.role === 'poster')
  return (
    <>
      <section
        aria-label='Poster delivery status'
        className='space-y-1'
      >
        <h4 className='font-medium'>Poster notice delivery</h4>
        {posterRecipients.length === 0 ? (
          <p className='text-sm text-muted-foreground'>No poster delivery is recorded.</p>
        ) : (
          <ul className='space-y-1 text-sm'>
            {posterRecipients.map((recipient, index) => (
              <li key={`${recipient.role}:${recipient.user_id ?? 'guest'}`}>
                Poster {index + 1}: {recipient.state ?? 'not sent'}; informed{' '}
                {formatDate(recipient.informed_at)}.
              </li>
            ))}
          </ul>
        )}
        <PaginatedListFooter
          fetchError={recipientList.fetchError}
          canLoadMore={recipientList.hasNextPage}
          loadingMore={recipientList.loadingMore}
          clearError={recipientList.clearError}
          loadMore={() => {
            void recipientList.loadMore()
          }}
        />
      </section>
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
          recipients={recipients}
          recipientsComplete={!hasNextPage}
        />
      ) : null}
    </>
  )
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
