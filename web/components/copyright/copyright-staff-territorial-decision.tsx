'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  decideCopyrightTerritorialNotice,
  type CopyrightTerritorialPostTarget,
} from '@/lib/api/client/copyright-territorial-decisions'
import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightNoticeTargetPicker } from './copyright-notice-target-picker'
import type { SubmitReview } from './copyright-staff-review-buttons'

export function CopyrightStaffTerritorialDecision({
  item,
  pending,
  onReview,
}: {
  item: CopyrightStaffQueueItem
  pending: boolean
  onReview: SubmitReview
}) {
  const territorial = item.territorial
  const reopened = Boolean(territorial?.reopened_at)
  const [outcome, setOutcome] = useState<'restrict' | 'no_action'>(
    reopened ? 'restrict' : 'no_action',
  )
  const [rationale, setRationale] = useState('')
  const [publicExplanation, setPublicExplanation] = useState('')
  const [targets, setTargets] = useState<CopyrightNoticeResolvedTarget[]>([])
  if (!territorial || item.jurisdiction === 'us_dmca' || (territorial.decision && !reopened))
    return null
  const jurisdiction = item.jurisdiction

  const postTargets: CopyrightTerritorialPostTarget[] =
    targets.flatMap<CopyrightTerritorialPostTarget>(target =>
      target.surface === 'post-image'
        ? [
            {
              surface: 'post-image',
              post_id: target.post_id,
              image_id: target.image_id,
              target_url: target.target_url,
            },
          ]
        : [],
    )
  const canSubmit =
    Boolean(rationale.trim() && publicExplanation.trim()) &&
    (outcome === 'no_action' || postTargets.length > 0)

  function submit() {
    if (pending || !canSubmit) return
    onReview(
      () =>
        decideCopyrightTerritorialNotice(jurisdiction, item.id, {
          text: rationale.trim(),
          publicExplanation: publicExplanation.trim(),
          outcome,
          ...(outcome === 'restrict' ? { targets: postTargets } : {}),
        }),
      'Territorial decision recorded.',
    )
  }

  return (
    <section
      className='space-y-4 rounded border p-4'
      data-pw='copyright-staff-territorial-decision'
    >
      <h3 className='font-medium'>EU or UK notice decision</h3>
      {reopened && (
        <p className='text-sm'>
          The complaint was upheld. Record a new Restrict decision for this notice.
        </p>
      )}
      <fieldset className='space-y-2'>
        <legend
          className='text-sm font-medium'
          id={`territorial-outcome-label-${item.id}`}
        >
          Decision
        </legend>
        <RadioGroup
          aria-labelledby={`territorial-outcome-label-${item.id}`}
          name={`territorial-outcome-${item.id}`}
          onValueChange={value => {
            if (value === 'restrict' || (!reopened && value === 'no_action')) setOutcome(value)
          }}
          value={outcome}
        >
          <div className='flex items-center gap-2'>
            <RadioGroupItem
              id={`territorial-restrict-${item.id}`}
              value='restrict'
            />
            <Label htmlFor={`territorial-restrict-${item.id}`}>Restrict</Label>
          </div>
          {!reopened && (
            <div className='flex items-center gap-2'>
              <RadioGroupItem
                id={`territorial-no-action-${item.id}`}
                value='no_action'
              />
              <Label htmlFor={`territorial-no-action-${item.id}`}>No action</Label>
            </div>
          )}
        </RadioGroup>
      </fieldset>
      <div className='space-y-1'>
        <Label htmlFor={`territorial-rationale-${item.id}`}>Internal rationale</Label>
        <p className='text-sm text-muted-foreground'>
          This record is for staff. It is not sent to either party.
        </p>
        <Textarea
          id={`territorial-rationale-${item.id}`}
          maxLength={50_000}
          onChange={event => setRationale(event.target.value)}
          required
          value={rationale}
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`territorial-explanation-${item.id}`}>
          Explanation for the poster and the notifier
        </Label>
        <p className='text-sm text-muted-foreground'>
          This explanation is sent to both parties. Keep personal data out of it. Up to 2,000
          characters.
        </p>
        <Textarea
          id={`territorial-explanation-${item.id}`}
          maxLength={2_000}
          onChange={event => setPublicExplanation(event.target.value)}
          required
          value={publicExplanation}
        />
      </div>
      {outcome === 'restrict' && (
        <div className='space-y-2'>
          <p className='text-sm'>Restrict withholds each selected image for every viewer.</p>
          <CopyrightNoticeTargetPicker
            hint={null}
            initialUrl={territorial.hosted_use_url}
            legend='Post images named in the notice'
            onChange={setTargets}
            postImagesOnly
            targets={targets}
          />
        </div>
      )}
      <Button
        disabled={pending || !canSubmit}
        onClick={submit}
        type='button'
      >
        Record decision
      </Button>
    </section>
  )
}
