'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  recordCopyrightEuDisputeSettlementImplementation,
  recordCopyrightEuDisputeSettlementOutcome,
  type CopyrightEuDisputeSettlementResult,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { dateForInput } from './copyright-staff-territorial-dispute-date'

const resultLabels: Record<CopyrightEuDisputeSettlementResult, string> = {
  decided_for_recipient: 'Decided for the recipient',
  decided_for_platform: 'Decided for the platform',
  withdrawn: 'Withdrawn',
  no_decision: 'No decision',
}

export function CopyrightStaffTerritorialSettlementRecord({
  item,
  referral,
  onReview,
  pending,
}: {
  item: CopyrightStaffQueueItem
  referral: NonNullable<CopyrightStaffQueueItem['territorial']>['dispute_settlements'][number]
  onReview: SubmitReview
  pending: boolean
}) {
  const [result, setResult] = useState<CopyrightEuDisputeSettlementResult>('no_decision')
  const [decidedAt, setDecidedAt] = useState(() => dateForInput())
  const [implementedAt, setImplementedAt] = useState(() => dateForInput())
  return (
    <article className='space-y-3 rounded border p-3'>
      <div className='space-y-1 text-sm'>
        <h4 className='font-medium'>{referral.body_name}</h4>
        <p>
          Referred {new Date(referral.referred_at).toLocaleString()} by {referral.referred_by_party}
        </p>
      </div>
      {!referral.outcome ? (
        <OutcomeFields
          decidedAt={decidedAt}
          onReview={onReview}
          pending={pending}
          referralId={referral.id}
          result={result}
          setDecidedAt={setDecidedAt}
          setResult={setResult}
          noticeId={item.id}
        />
      ) : (
        <div className='space-y-2 text-sm'>
          <p>Outcome: {labelForResult(referral.outcome.result)}</p>
          <p>Recorded {new Date(referral.outcome.decided_at).toLocaleString()}</p>
          {referral.outcome.implemented_at ? (
            <p>
              Implementation recorded {new Date(referral.outcome.implemented_at).toLocaleString()}
            </p>
          ) : referral.outcome.result === 'decided_for_recipient' ? (
            <ImplementationFields
              implementedAt={implementedAt}
              noticeId={item.id}
              onReview={onReview}
              pending={pending}
              referralId={referral.id}
              setImplementedAt={setImplementedAt}
            />
          ) : null}
        </div>
      )}
    </article>
  )
}

function labelForResult(value: string): string {
  return value in resultLabels ? resultLabels[value as CopyrightEuDisputeSettlementResult] : value
}

function OutcomeFields({
  decidedAt,
  noticeId,
  onReview,
  pending,
  referralId,
  result,
  setDecidedAt,
  setResult,
}: {
  decidedAt: string
  noticeId: string
  onReview: SubmitReview
  pending: boolean
  referralId: string
  result: CopyrightEuDisputeSettlementResult
  setDecidedAt: (value: string) => void
  setResult: (value: CopyrightEuDisputeSettlementResult) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={`dispute-result-${referralId}`}>Body outcome</Label>
      <select
        className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'
        id={`dispute-result-${referralId}`}
        onChange={event => setResult(event.target.value as CopyrightEuDisputeSettlementResult)}
        value={result}
      >
        {Object.entries(resultLabels).map(([value, label]) => (
          <option
            key={value}
            value={value}
          >
            {label}
          </option>
        ))}
      </select>
      <Label htmlFor={`dispute-decided-at-${referralId}`}>Outcome date</Label>
      <Input
        id={`dispute-decided-at-${referralId}`}
        onChange={event => setDecidedAt(event.target.value)}
        type='datetime-local'
        value={decidedAt}
      />
      <ButtonGroup>
        <Button
          disabled={pending || !decidedAt}
          onClick={() =>
            onReview(
              () =>
                recordCopyrightEuDisputeSettlementOutcome(noticeId, referralId, {
                  result,
                  decided_at: new Date(decidedAt).toISOString(),
                }),
              'Dispute settlement outcome recorded.',
            )
          }
          size='touchSm'
        >
          Record outcome
        </Button>
      </ButtonGroup>
    </div>
  )
}

function ImplementationFields({
  implementedAt,
  noticeId,
  onReview,
  pending,
  referralId,
  setImplementedAt,
}: {
  implementedAt: string
  noticeId: string
  onReview: SubmitReview
  pending: boolean
  referralId: string
  setImplementedAt: (value: string) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={`dispute-implemented-at-${referralId}`}>Implementation date</Label>
      <Input
        id={`dispute-implemented-at-${referralId}`}
        onChange={event => setImplementedAt(event.target.value)}
        type='datetime-local'
        value={implementedAt}
      />
      <ButtonGroup>
        <Button
          disabled={pending || !implementedAt}
          onClick={() =>
            onReview(
              () =>
                recordCopyrightEuDisputeSettlementImplementation(noticeId, referralId, {
                  implemented_at: new Date(implementedAt).toISOString(),
                }),
              'Dispute settlement implementation recorded.',
            )
          }
          size='touchSm'
        >
          Record implementation
        </Button>
      </ButtonGroup>
    </div>
  )
}
