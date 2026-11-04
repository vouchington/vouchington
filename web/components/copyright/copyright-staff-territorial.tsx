'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { recordCopyrightTerritorialAcknowledgmentFailure } from '@/lib/api/client/copyright-territorial-decisions'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffTerritorialDecision } from './copyright-staff-territorial-decision'
import { CopyrightStaffTerritorialCollections } from './copyright-staff-territorial-collections'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { ExternalLink } from '@/components/ui/external-link'
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
  const [showDetails, setShowDetails] = useState(false)
  if (!territorial || item.jurisdiction === 'us_dmca') return null
  const jurisdiction = item.jurisdiction
  const acknowledgmentTerminal =
    territorial.acknowledgment.acknowledged_at !== null ||
    territorial.acknowledgment.exhausted_at !== null
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
            <ExternalLink
              data-pw='copyright-staff-territorial-hosted-use-url'
              href={territorial.hosted_use_url}
              rel='noreferrer'
            >
              {territorial.hosted_use_url}
            </ExternalLink>
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
              data-pw='copyright-staff-territorial-record-failure'
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

      <CopyrightStaffTerritorialDecision
        item={item}
        onReview={onReview}
        pending={pending}
      />
      <section
        aria-label='Case details'
        className='space-y-3'
      >
        <p className='text-sm'>
          {territorial.complaint_count} complaint{territorial.complaint_count === 1 ? '' : 's'}
          {item.jurisdiction === 'eu_dsa'
            ? `, ${territorial.dispute_settlement_count} dispute settlement${territorial.dispute_settlement_count === 1 ? '' : 's'}`
            : ''}
          .
        </p>
        <Button
          data-pw='copyright-staff-territorial-open-details'
          onClick={() => setShowDetails(true)}
          size='touchSm'
          type='button'
        >
          View deliveries, complaints and settlements
        </Button>
        {showDetails ? (
          <CopyrightStaffTerritorialCollections
            item={item}
            onClose={() => setShowDetails(false)}
            onReview={onReview}
            pending={pending}
          />
        ) : null}
      </section>
    </section>
  )
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
