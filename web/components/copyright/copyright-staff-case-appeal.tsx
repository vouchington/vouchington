'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
        <div
          className='space-y-1'
          key={restriction.id}
        >
          <Label htmlFor={`copyright-appeal-${appeal.submission_id}-${restriction.id}`}>
            Target {index + 1} outcome
          </Label>
          <Select
            value={decisions[restriction.id] ?? 'confirm'}
            onValueChange={value =>
              setDecisions(current => ({
                ...current,
                [restriction.id]: value as 'confirm' | 'reverse',
              }))
            }
          >
            <SelectTrigger id={`copyright-appeal-${appeal.submission_id}-${restriction.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='confirm'>Keep restriction</SelectItem>
              <SelectItem value='reverse'>Reverse restriction</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
