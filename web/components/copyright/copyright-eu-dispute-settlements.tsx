'use client'

import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { listCopyrightEuDisputeSettlements } from '@/lib/api/client/copyright-eu-dispute-settlements'
import type {
  CopyrightEuDisputeSettlement,
  CopyrightEuDisputeSettlementsPage,
} from '@/types/copyright-eu'

export function CopyrightEuDisputeSettlements({
  noticeId,
  data,
}: {
  noticeId: string
  data: CopyrightEuDisputeSettlementsPage
}) {
  const { pages, hasNextPage, loadMore, loadingMore, fetchError, clearError } = usePaginatedList(
    data,
    `/api/v1/copyright-notices/${noticeId}/eu-dispute-settlements`,
    {},
    { loadPage: after => listCopyrightEuDisputeSettlements(noticeId, { after }) },
  )
  const referrals = new Map<string, CopyrightEuDisputeSettlement>()
  for (const page of pages) {
    for (const referral of page.copyright_eu_dispute_settlements)
      referrals.set(referral.id, referral)
  }
  return (
    <section
      className='space-y-2'
      data-pw='copyright-eu-dispute-settlements'
    >
      <h2 className='text-lg font-semibold'>Dispute settlements</h2>
      {referrals.size === 0 ? (
        <p>No dispute settlement has been recorded.</p>
      ) : (
        <ul className='space-y-3'>
          {[...referrals.values()].map(referral => (
            <li
              key={referral.id}
              className='rounded border p-3'
            >
              <p>{referral.body_name}</p>
              <p>Referred {new Date(referral.referred_at).toLocaleDateString()}</p>
              {referral.outcome ? (
                <div>
                  <p>Outcome: {referral.outcome.result.replaceAll('_', ' ')}</p>
                  <p>Decided {new Date(referral.outcome.decided_at).toLocaleDateString()}</p>
                  {referral.outcome.implemented_at && (
                    <p>
                      Implemented {new Date(referral.outcome.implemented_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ) : (
                <p>No outcome has been recorded.</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <PaginatedListFooter
        canLoadMore={hasNextPage}
        fetchError={fetchError}
        loadingMore={loadingMore}
        clearError={clearError}
        loadMore={async () => {
          await loadMore()
        }}
      />
    </section>
  )
}
