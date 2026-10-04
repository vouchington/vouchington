'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  decideCopyrightTerritorialRedress,
  type CopyrightTerritorialComplaint,
} from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'

export function CopyrightStaffTerritorialComplaintReview({
  complaint,
  item,
  onReview,
  pending,
}: {
  complaint: CopyrightTerritorialComplaint
  item: CopyrightStaffQueueItem
  onReview: SubmitReview
  pending: boolean
}) {
  const [disposition, setDisposition] = useState<'maintain' | 'revoke'>('maintain')
  const [rationale, setRationale] = useState('')
  const trimmedRationale = rationale.trim()
  const jurisdiction = item.jurisdiction
  if (jurisdiction === 'us_dmca') return null
  return (
    <article className='space-y-3 rounded border p-3'>
      <div className='space-y-1'>
        <h4 className='font-medium'>Complaint from {complaint.filed_by}</h4>
        <p className='whitespace-pre-wrap text-sm'>{complaint.explanation}</p>
        <p className='text-sm text-muted-foreground'>
          Informed: {formatDate(complaint.informed_at)} · Complaint deadline:{' '}
          {formatDate(complaint.window_ends_at)}
        </p>
      </div>
      {complaint.decision ? (
        <div className='space-y-1 text-sm'>
          <p>Decision: {complaint.decision.staff_disposition}</p>
          <p>Decision recorded {formatDate(complaint.decision.decided_at)}</p>
          <p className='whitespace-pre-wrap'>Rationale: {complaint.decision.rationale}</p>
        </div>
      ) : (
        <div className='space-y-3'>
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>Complaint decision</legend>
            <RadioGroup
              aria-label={`Decision for complaint ${complaint.id}`}
              onValueChange={value => setDisposition(value as 'maintain' | 'revoke')}
              value={disposition}
            >
              <div className='flex items-center gap-2'>
                <RadioGroupItem
                  id={`maintain-${complaint.id}`}
                  value='maintain'
                />
                <Label htmlFor={`maintain-${complaint.id}`}>Maintain</Label>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem
                  id={`revoke-${complaint.id}`}
                  value='revoke'
                />
                <Label htmlFor={`revoke-${complaint.id}`}>Revoke</Label>
              </div>
            </RadioGroup>
          </fieldset>
          <p className='text-sm text-muted-foreground'>
            Revoke restores restricted material and voids its repeat-infringer incident. Revoke on a
            no-action decision returns the notice to staff for a new decision.
          </p>
          <div className='space-y-2'>
            <Label htmlFor={`complaint-rationale-${complaint.id}`}>
              Rationale for the complainant
            </Label>
            <p className='text-sm text-muted-foreground'>
              This rationale is written for the complainant.
            </p>
            <Textarea
              id={`complaint-rationale-${complaint.id}`}
              onChange={event => setRationale(event.target.value)}
              value={rationale}
            />
          </div>
          <ButtonGroup>
            <Button
              disabled={pending || trimmedRationale.length === 0}
              onClick={() =>
                onReview(
                  () =>
                    decideCopyrightTerritorialRedress(jurisdiction, item.id, complaint.id, {
                      staff_disposition: disposition,
                      rationale: trimmedRationale,
                    }),
                  `${disposition === 'maintain' ? 'Maintain' : 'Revoke'} decision recorded.`,
                )
              }
              size='touchSm'
            >
              Record {disposition === 'maintain' ? 'Maintain' : 'Revoke'} decision
            </Button>
          </ButtonGroup>
        </div>
      )}
    </article>
  )
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}
