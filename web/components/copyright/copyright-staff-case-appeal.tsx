'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { reviewCopyrightAppeal } from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'

export function CopyrightStaffAppealReview({
  appeal,
  restrictions,
  pending,
  canSubmit,
  rationale,
  submit,
}: {
  appeal: CopyrightStaffQueueItem['appeals'][number]
  restrictions: CopyrightStaffQueueItem['restrictions']
  pending: boolean
  canSubmit: boolean
  rationale: string
  submit: SubmitReview
}) {
  const activeRestrictions = restrictions.filter(
    restriction =>
      appeal.target_ids.includes(restriction.target_id) && restriction.status !== 'lifted',
  )
  const [decisions, setDecisions] = useState<Record<string, 'confirm' | 'reverse'>>({})
  const review = () =>
    reviewCopyrightAppeal(appeal.submission_id, {
      rationale,
      ...(appeal.recommendation
        ? { recommendation_id: appeal.recommendation.id }
        : { manual_fallback_reason: rationale }),
      decisions: activeRestrictions.map(restriction => ({
        restriction_id: restriction.id,
        action: decisions[restriction.id] ?? 'confirm',
      })),
    })
  return (
    <section className='space-y-2'>
      <h3 className='font-medium'>Appeal</h3>
      <p className='text-sm'>
        {appeal.reason}
        {appeal.recommendation
          ? ` Agent: ${appeal.recommendation.recommendation}. ${appeal.recommendation.rationale}`
          : ''}
      </p>
      {activeRestrictions.map((restriction, index) => (
        <label
          className='block text-sm'
          htmlFor={`copyright-appeal-${appeal.submission_id}-${restriction.id}`}
          key={restriction.id}
        >
          Target {index + 1} outcome
          <select
            className='ml-2 rounded border bg-background p-1'
            id={`copyright-appeal-${appeal.submission_id}-${restriction.id}`}
            value={decisions[restriction.id] ?? 'confirm'}
            onChange={event =>
              setDecisions(current => ({
                ...current,
                [restriction.id]: event.target.value as 'confirm' | 'reverse',
              }))
            }
          >
            <option value='confirm'>Keep restriction</option>
            <option value='reverse'>Reverse restriction</option>
          </select>
        </label>
      ))}
      <Button
        disabled={pending || !canSubmit || activeRestrictions.length === 0}
        onClick={() => submit(review, 'Appeal outcomes recorded.')}
      >
        Record target outcomes
      </Button>
    </section>
  )
}
