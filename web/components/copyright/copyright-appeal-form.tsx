'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { createCopyrightAppeal } from '@/lib/api/client/copyright-notices'
import onError, { onSuccess } from '@/lib/on-error'
import { useCopyrightTargetSelection } from './copyright-target-selection'

export function CopyrightAppealForm({
  noticeId,
  targetIds,
}: {
  noticeId: string
  targetIds: string[]
}) {
  const turnstile = useTurnstileToken()
  const [reason, setReason] = useState('')
  const [selectedTargetIds, setSelectedTargetIds] = useCopyrightTargetSelection(targetIds)
  const [pending, startTransition] = useTransition()
  function submit() {
    if (!reason.trim() || !turnstile.token || pending) return
    startTransition(async () => {
      try {
        const result = await createCopyrightAppeal(noticeId, {
          reason: reason.trim(),
          target_ids: selectedTargetIds,
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        onSuccess(
          result.is_duplicate
            ? 'This appeal was already received.'
            : 'Appeal received. A moderator will review it.',
        )
        setReason('')
      } catch (error) {
        onError(error, {
          fallback: 'We could not submit this appeal. Please try again.',
          tags: { form: 'copyright-appeal' },
        })
        turnstile.reset()
      }
    })
  }
  return (
    <form
      className='space-y-3'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <div className='space-y-1'>
        <Label htmlFor='copyright-appeal-reason'>Why should this action be changed?</Label>
        <Textarea
          id='copyright-appeal-reason'
          value={reason}
          onChange={event => setReason(event.target.value)}
          required
        />
      </div>
      <TargetScopeSelector
        targetIds={targetIds}
        selectedTargetIds={selectedTargetIds}
        onChange={setSelectedTargetIds}
      />
      <TurnstileField turnstile={turnstile} />
      <Button
        type='submit'
        disabled={pending || !reason.trim() || selectedTargetIds.length === 0 || !turnstile.token}
      >
        Submit appeal
      </Button>
    </form>
  )
}

export function TargetScopeSelector({
  targetIds,
  selectedTargetIds,
  onChange,
}: {
  targetIds: string[]
  selectedTargetIds: string[]
  onChange: (targetIds: string[]) => void
}) {
  function toggle(targetId: string, checked: boolean) {
    onChange(
      checked
        ? [...selectedTargetIds, targetId]
        : selectedTargetIds.filter(selectedTargetId => selectedTargetId !== targetId),
    )
  }
  return (
    <fieldset className='space-y-2 rounded border p-3'>
      <legend className='px-1 text-sm font-medium'>Affected material</legend>
      <p className='text-sm text-muted-foreground'>Select at least one affected item.</p>
      {targetIds.map((targetId, index) => {
        const id = `copyright-target-${targetId}`
        return (
          <Label
            className='flex items-center gap-2 text-sm'
            htmlFor={id}
            key={targetId}
          >
            <Checkbox
              id={id}
              checked={selectedTargetIds.includes(targetId)}
              onCheckedChange={checked => toggle(targetId, checked === true)}
            />
            Affected material {index + 1}
          </Label>
        )
      })}
    </fieldset>
  )
}
