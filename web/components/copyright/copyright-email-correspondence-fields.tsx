'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  CopyrightEmailCorrespondenceKind,
  CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import type { CopyrightEmailCorrespondenceDraft } from './copyright-email-correspondence-model'

export function CopyrightEmailCorrespondenceFields({
  detail,
  draft,
  onChange,
}: {
  detail: CopyrightEmailIntake
  draft: CopyrightEmailCorrespondenceDraft
  onChange: (draft: CopyrightEmailCorrespondenceDraft) => void
}) {
  const targets = detail.linked_notice?.targets ?? []
  const set = <K extends keyof CopyrightEmailCorrespondenceDraft>(
    key: K,
    value: CopyrightEmailCorrespondenceDraft[K],
  ) => onChange({ ...draft, [key]: value })
  const needsTargets = draft.kind === 'appeal' || draft.kind === 'counter_notice'
  return (
    <fieldset className='space-y-3 rounded border p-3'>
      <legend className='px-1 font-medium'>Matched-email classification</legend>
      <Label>
        Classification
        <select
          aria-label='Correspondence classification'
          className='ml-2 rounded border bg-background p-1'
          value={draft.kind}
          onChange={event => set('kind', event.target.value as CopyrightEmailCorrespondenceKind)}
        >
          <option value='supplement'>Supplement</option>
          <option value='appeal'>Appeal</option>
          <option value='counter_notice'>Counter-notice</option>
          <option value='withdrawal'>Withdrawal</option>
          <option value='court_or_ccb_hold'>Court or CCB filing</option>
        </select>
      </Label>
      {draft.kind === 'appeal' ? (
        <Textarea
          aria-label='Appeal reason'
          onChange={event => set('appeal_reason', event.target.value)}
          placeholder='Verified appeal reason'
          value={draft.appeal_reason}
        />
      ) : draft.kind === 'counter_notice' ? (
        <>
          <Input
            aria-label='Counter-notice name'
            onChange={event => set('name', event.target.value)}
            placeholder='Name'
            value={draft.name}
          />
          <Textarea
            aria-label='Counter-notice address'
            onChange={event => set('address', event.target.value)}
            placeholder='Address'
            value={draft.address}
          />
          <Input
            aria-label='Counter-notice telephone'
            onChange={event => set('telephone', event.target.value)}
            placeholder='Telephone'
            value={draft.telephone}
          />
          <Input
            aria-label='Counter-notice electronic signature'
            onChange={event => set('electronic_signature', event.target.value)}
            placeholder='Electronic signature'
            value={draft.electronic_signature}
          />
          <Declaration
            checked={draft.consent_to_federal_jurisdiction}
            id='email-correspondence-jurisdiction'
            label='Consent to federal jurisdiction'
            onChange={value => set('consent_to_federal_jurisdiction', value)}
          />
          <Declaration
            checked={draft.consent_to_service_of_process}
            id='email-correspondence-service'
            label='Consent to service of process'
            onChange={value => set('consent_to_service_of_process', value)}
          />
          <Declaration
            checked={draft.good_faith_misidentification_under_penalty_of_perjury}
            id='email-correspondence-perjury'
            label='Good-faith misidentification statement under penalty of perjury'
            onChange={value => set('good_faith_misidentification_under_penalty_of_perjury', value)}
          />
        </>
      ) : (
        <Textarea
          aria-label='Correspondence summary'
          onChange={event => set('submission_summary', event.target.value)}
          placeholder='Verified summary of the matched email'
          value={draft.submission_summary}
        />
      )}
      {needsTargets && (
        <div className='space-y-1'>
          <p className='text-sm font-medium'>Affected case targets</p>
          {targets.map(target => (
            <Label
              className='flex items-center gap-2'
              key={target.id}
            >
              <Checkbox
                checked={draft.target_ids.includes(target.id)}
                onCheckedChange={checked =>
                  set(
                    'target_ids',
                    checked === true
                      ? [...draft.target_ids, target.id]
                      : draft.target_ids.filter(id => id !== target.id),
                  )
                }
              />
              {target.placement_key}
            </Label>
          ))}
        </div>
      )}
      {draft.kind === 'withdrawal' && (
        <p className='text-sm text-muted-foreground'>
          A withdrawal is retained as evidence and does not automatically restore material. Staff
          must record any separate restriction decision on the case.
        </p>
      )}
    </fieldset>
  )
}

function Declaration({
  checked,
  id,
  label,
  onChange,
}: {
  checked: boolean
  id: string
  label: string
  onChange: (value: boolean) => void
}) {
  return (
    <Label
      className='flex items-center gap-2'
      htmlFor={id}
    >
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={value => onChange(value === true)}
      />
      {label}
    </Label>
  )
}
