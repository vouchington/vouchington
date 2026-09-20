'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  addCopyrightEmailApprovalTarget,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'

export function CopyrightEmailApprovalFields({
  draft,
  onChange,
}: {
  draft: CopyrightEmailApprovalDraft
  onChange: (draft: CopyrightEmailApprovalDraft) => void
}) {
  const set = <K extends keyof CopyrightEmailApprovalDraft>(
    key: K,
    value: CopyrightEmailApprovalDraft[K],
  ) => onChange({ ...draft, [key]: value })
  const setTarget = (
    id: string,
    key: keyof CopyrightEmailApprovalDraft['targets'][number],
    value: string,
  ) =>
    set(
      'targets',
      draft.targets.map(target => (target.id === id ? { ...target, [key]: value } : target)),
    )
  return (
    <fieldset className='space-y-3 rounded border p-3'>
      <legend className='px-1 font-medium'>Verified statutory notice fields</legend>
      <Input
        aria-label='Claimant name'
        onChange={event => set('claimant_display_name', event.target.value)}
        placeholder='Claimant name'
        value={draft.claimant_display_name}
      />
      <Textarea
        aria-label='Claimant contact information'
        onChange={event => set('claimant_contact', event.target.value)}
        placeholder='Claimant contact information'
        value={draft.claimant_contact}
      />
      <Input
        aria-label='Claimant email'
        onChange={event => set('claimant_email', event.target.value)}
        placeholder='Claimant email'
        type='email'
        value={draft.claimant_email}
      />
      <Textarea
        aria-label='Copyrighted work description'
        onChange={event => set('work_description', event.target.value)}
        placeholder='Copyrighted work description'
        value={draft.work_description}
      />
      <Input
        aria-label='Electronic signature'
        onChange={event => set('electronic_signature', event.target.value)}
        placeholder='Electronic signature'
        value={draft.electronic_signature}
      />
      {draft.targets.map((target, index) => (
        <div
          className='space-y-2 rounded border p-3'
          key={target.id}
        >
          <p className='text-sm font-medium'>Hosted image {index + 1}</p>
          <Input
            aria-label={`Hosted use URL ${index + 1}`}
            onChange={event => setTarget(target.id, 'target_url', event.target.value)}
            placeholder='Hosted use URL'
            value={target.target_url}
          />
          <Input
            aria-label={`Post ID ${index + 1}`}
            onChange={event => setTarget(target.id, 'post_id', event.target.value)}
            placeholder='Resolved post ID'
            value={target.post_id}
          />
          <Input
            aria-label={`Image ID ${index + 1}`}
            onChange={event => setTarget(target.id, 'image_id', event.target.value)}
            placeholder='Resolved image ID'
            value={target.image_id}
          />
          {draft.targets.length > 1 && (
            <Button
              onClick={() =>
                set(
                  'targets',
                  draft.targets.filter(item => item.id !== target.id),
                )
              }
              type='button'
              variant='outline'
            >
              Remove hosted image
            </Button>
          )}
        </div>
      ))}
      <Button
        onClick={() => onChange(addCopyrightEmailApprovalTarget(draft))}
        type='button'
        variant='outline'
      >
        Add hosted image
      </Button>
      <div className='flex items-start gap-2 text-sm'>
        <Checkbox
          id='copyright-email-good-faith'
          checked={draft.good_faith_belief}
          onCheckedChange={checked => set('good_faith_belief', checked === true)}
        />
        <Label htmlFor='copyright-email-good-faith'>
          The email states a good-faith belief that the complained-of use is unauthorized.
        </Label>
      </div>
      <div className='flex items-start gap-2 text-sm'>
        <Checkbox
          id='copyright-email-authority'
          checked={draft.accuracy_authority_under_penalty_of_perjury}
          onCheckedChange={checked =>
            set('accuracy_authority_under_penalty_of_perjury', checked === true)
          }
        />
        <Label htmlFor='copyright-email-authority'>
          The email states that the notice is accurate and, under penalty of perjury, the sender is
          authorized to act.
        </Label>
      </div>
    </fieldset>
  )
}
