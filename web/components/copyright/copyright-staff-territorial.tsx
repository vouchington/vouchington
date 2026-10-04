'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { recordCopyrightTerritorialAcknowledgmentFailure } from '@/lib/api/client/copyright-territorial-decisions'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffTerritorialDecision } from './copyright-staff-territorial-decision'
import { CopyrightStaffTerritorialComplaintList } from './copyright-staff-territorial-complaint-list'
import { CopyrightStaffTerritorialDispute } from './copyright-staff-territorial-dispute'
import type { SubmitReview } from './copyright-staff-review-buttons'
import type {
  CopyrightEuDisputeSettlementsPage,
  CopyrightTerritorialComplaintsPage,
} from '@/lib/api/client/copyright-territorial-redress'

export function CopyrightStaffTerritorial({
  item,
  pending,
  onReview,
}: {
  item: CopyrightStaffQueueItem
  pending: boolean
  onReview: SubmitReview
}) {
  const territorial = item.territorial
  const complaints = territorial?.complaints
  const complaintsPageInfo = territorial?.complaints_page_info
  const disputeSettlements = territorial?.dispute_settlements
  const disputeSettlementsPageInfo = territorial?.dispute_settlements_page_info
  const complaintPage = useMemo<CopyrightTerritorialComplaintsPage | null>(() => {
    if (!complaints || !complaintsPageInfo) return null
    return {
      copyright_territorial_complaints: complaints,
      page_info: complaintsPageInfo,
    }
  }, [complaints, complaintsPageInfo])
  const disputePage = useMemo<CopyrightEuDisputeSettlementsPage | null>(() => {
    if (!disputeSettlements || !disputeSettlementsPageInfo) return null
    return {
      copyright_eu_dispute_settlements: disputeSettlements,
      page_info: disputeSettlementsPageInfo,
    }
  }, [disputeSettlements, disputeSettlementsPageInfo])
  if (!territorial || item.jurisdiction === 'us_dmca') return null
  if (!complaintPage || !disputePage) return null
  const jurisdiction = item.jurisdiction
  const acknowledgmentTerminal =
    territorial.acknowledgment.acknowledged_at !== null ||
    territorial.acknowledgment.exhausted_at !== null
  const posterRecipients = territorial.recipients.filter(recipient => recipient.role === 'poster')
  return (
    <section
      aria-label='Territorial notice review'
      className='space-y-4 rounded border p-4'
      data-pw='copyright-staff-territorial'
    >
      <h3 className='text-lg font-semibold'>EU/UK notice details</h3>
      <dl className='grid gap-2 text-sm'>
        <div>
          <dt className='font-medium'>Notifier</dt>
          <dd>{territorial.notifier.name ?? item.claimant.display_name ?? 'Name not recorded'}</dd>
        </div>
        <div>
          <dt className='font-medium'>Notifier email</dt>
          <dd>{territorial.notifier.email ?? 'Email not recorded'}</dd>
        </div>
        <div>
          <dt className='font-medium'>Contact</dt>
          <dd>{item.claimant.contact}</dd>
        </div>
        <div>
          <dt className='font-medium'>Content description</dt>
          <dd>{item.work_description}</dd>
        </div>
        <div>
          <dt className='font-medium'>Hosted use</dt>
          <dd>
            <a
              href={territorial.hosted_use_url}
              rel='noreferrer'
              target='_blank'
            >
              {territorial.hosted_use_url}
            </a>
          </dd>
        </div>
        <div>
          <dt className='font-medium'>Grounds</dt>
          <dd className='whitespace-pre-wrap'>{territorial.grounds}</dd>
        </div>
      </dl>

      <section
        aria-label='Acknowledgment status'
        className='space-y-2'
      >
        <h4 className='font-medium'>Acknowledgment</h4>
        <p className='text-sm'>
          Attempts: {territorial.acknowledgment.attempt_count}. Last attempt:{' '}
          {formatDate(territorial.acknowledgment.last_attempt_at)}. Acknowledged:{' '}
          {formatDate(territorial.acknowledgment.acknowledged_at)}.
        </p>
        {territorial.acknowledgment.exhausted_at ? (
          <p className='text-sm text-muted-foreground'>
            Acknowledgment attempts are exhausted. Escalated:{' '}
            {territorial.acknowledgment.escalated ? 'yes' : 'no'}.
          </p>
        ) : null}
        {!acknowledgmentTerminal ? (
          <ButtonGroup>
            <Button
              disabled={pending}
              onClick={() =>
                onReview(
                  () => recordCopyrightTerritorialAcknowledgmentFailure(jurisdiction, item.id),
                  'Failed acknowledgment recorded.',
                )
              }
              size='touchSm'
              type='button'
            >
              Record failed acknowledgment
            </Button>
          </ButtonGroup>
        ) : null}
      </section>

      {territorial.decision ? (
        <section
          aria-label='Current decision'
          className='space-y-2'
        >
          <h4 className='font-medium'>Current decision: {territorial.decision.outcome}</h4>
          <p className='text-sm'>Decided {formatDate(territorial.decision.decided_at)}</p>
          <p className='whitespace-pre-wrap text-sm'>
            Internal rationale: {territorial.decision.rationale}
          </p>
          <p className='whitespace-pre-wrap text-sm'>
            Public explanation: {territorial.decision.public_explanation}
          </p>
        </section>
      ) : null}
      {territorial.reopened_at ? (
        <p className='text-sm'>Complaint upheld. Reopened {formatDate(territorial.reopened_at)}.</p>
      ) : null}

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
      </section>

      <CopyrightStaffTerritorialDecision
        item={item}
        onReview={onReview}
        pending={pending}
      />
      <section
        aria-label='Territorial complaints'
        className='space-y-4'
        data-pw='copyright-staff-territorial-redress'
      >
        <h3 className='font-semibold'>Complaints</h3>
        <CopyrightStaffTerritorialComplaintList
          item={item}
          initialPage={complaintPage}
          onReview={onReview}
          pending={pending}
        />
      </section>
      {item.jurisdiction === 'eu_dsa' ? (
        <CopyrightStaffTerritorialDispute
          initialPage={disputePage}
          item={item}
          onReview={onReview}
          pending={pending}
        />
      ) : null}
    </section>
  )
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
