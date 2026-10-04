'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { referCopyrightEuDisputeSettlement } from '@/lib/api/client/copyright-territorial-redress'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { dateForInput } from './copyright-staff-territorial-dispute-date'

type PosterOption = { id: string; label: string }

function getPosterOptions(item: CopyrightStaffQueueItem): PosterOption[] {
  const posters = new Map<string, string>()
  for (const recipient of item.territorial?.recipients ?? []) {
    if (recipient.role === 'poster' && recipient.user_id && !posters.has(recipient.user_id)) {
      posters.set(recipient.user_id, `Poster ${posters.size + 1}`)
    }
  }
  return [...posters].map(([id, label]) => ({ id, label }))
}

export function CopyrightStaffTerritorialReferralFields({
  item,
  onReview,
  pending,
}: {
  item: CopyrightStaffQueueItem
  onReview: SubmitReview
  pending: boolean
}) {
  const posterOptions = getPosterOptions(item)
  const notifierId = item.territorial?.recipients.find(
    recipient => recipient.role === 'claimant',
  )?.user_id
  const [bodyName, setBodyName] = useState('')
  const [referredAt, setReferredAt] = useState(() => dateForInput())
  const [party, setParty] = useState<'' | 'poster' | 'notifier'>('')
  const [posterId, setPosterId] = useState(posterOptions[0]?.id ?? '')
  const referredByUserId = party === 'notifier' ? notifierId : party === 'poster' ? posterId : null
  const canSubmit =
    bodyName.trim().length > 0 &&
    referredAt.length > 0 &&
    party !== '' &&
    (party === 'notifier' || !!referredByUserId)
  return (
    <form
      className='space-y-3 rounded border p-3'
      onSubmit={event => {
        event.preventDefault()
        if (!canSubmit) return
        const referredByParty = party
        onReview(
          () =>
            referCopyrightEuDisputeSettlement(item.id, {
              body_name: bodyName.trim(),
              referred_at: new Date(referredAt).toISOString(),
              referred_by_party: referredByParty,
              ...(referredByUserId ? { referred_by_user_id: referredByUserId } : {}),
            }),
          'Dispute settlement referral recorded.',
        )
      }}
    >
      <h4 className='font-medium'>Record a referral</h4>
      <div className='space-y-1'>
        <Label htmlFor={`dispute-body-${item.id}`}>Dispute settlement body</Label>
        <Input
          id={`dispute-body-${item.id}`}
          maxLength={200}
          onChange={event => setBodyName(event.target.value)}
          value={bodyName}
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`dispute-referred-at-${item.id}`}>Referral date</Label>
        <Input
          id={`dispute-referred-at-${item.id}`}
          onChange={event => setReferredAt(event.target.value)}
          type='datetime-local'
          value={referredAt}
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`dispute-party-${item.id}`}>Party that referred the dispute</Label>
        <select
          className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'
          id={`dispute-party-${item.id}`}
          onChange={event => setParty(event.target.value as 'poster' | 'notifier')}
          value={party}
        >
          <option value=''>Choose a party</option>
          <option value='notifier'>Notifier</option>
          {posterOptions.length > 0 && <option value='poster'>Poster</option>}
        </select>
      </div>
      {party === 'poster' && posterOptions.length > 1 && (
        <div className='space-y-1'>
          <Label htmlFor={`dispute-poster-${item.id}`}>Poster</Label>
          <select
            className='h-9 w-full rounded-md border border-input bg-background px-3 text-sm'
            id={`dispute-poster-${item.id}`}
            onChange={event => setPosterId(event.target.value)}
            value={posterId}
          >
            {posterOptions.map(poster => (
              <option
                key={poster.id}
                value={poster.id}
              >
                {poster.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <ButtonGroup>
        <Button
          disabled={pending || !canSubmit}
          size='touchSm'
          type='submit'
        >
          Record referral
        </Button>
      </ButtonGroup>
    </form>
  )
}
