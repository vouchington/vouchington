'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  recordCopyrightEuDisputeSettlementOutcome,
  type CopyrightEuDisputeSettlementResult,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { dateForInput } from './copyright-staff-territorial-dispute-date'
import { CopyrightStaffTerritorialImplementationFields } from './copyright-staff-territorial-dispute-implementation'

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
            <CopyrightStaffTerritorialImplementationFields
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
      <Label
        htmlFor={`dispute-result-${referralId}`}
        id={`dispute-result-${referralId}-label`}
      >
        Body outcome
      </Label>
      <Select
        onValueChange={value => setResult(value as CopyrightEuDisputeSettlementResult)}
        value={result}
      >
        <SelectTrigger id={`dispute-result-${referralId}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(resultLabels).map(([value, label]) => (
            <SelectItem
              key={value}
              value={value}
            >
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
