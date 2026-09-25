'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { createCopyrightCounterNotice } from '@/lib/api/client/copyright-notices'
import onError, { onSuccess } from '@/lib/on-error'
import { DeclarationCheckbox, LabeledInput } from './copyright-form-fields'
import { TargetScopeSelector } from './copyright-appeal-form'
import { useCopyrightTargetSelection } from './copyright-target-selection'

export function CopyrightCounterNoticeForm({
  noticeId,
  targetIds,
}: {
  noticeId: string
  targetIds: string[]
}) {
  const router = useRouter()
  const turnstile = useTurnstileToken()
  const [submitted, setSubmitted] = useState(false)
  const [values, setValues] = useState({ name: '', address: '', telephone: '', signature: '' })
  const [selectedTargetIds, setSelectedTargetIds] = useCopyrightTargetSelection(targetIds)
  const [declarations, setDeclarations] = useState({
    misidentification: false,
    jurisdiction: false,
    service: false,
  })
  const [pending, startTransition] = useTransition()
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues(current => ({ ...current, [key]: event.target.value }))
  function submit() {
    if (!turnstile.token || pending || submitted) return
    startTransition(async () => {
      try {
        const result = await createCopyrightCounterNotice(noticeId, {
          name: values.name.trim(),
          address: values.address.trim(),
          telephone: values.telephone.trim(),
          electronic_signature: values.signature.trim(),
          good_faith_misidentification_under_penalty_of_perjury: declarations.misidentification,
          consent_to_federal_jurisdiction: declarations.jurisdiction,
          consent_to_service_of_process: declarations.service,
          target_ids: selectedTargetIds,
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        setSubmitted(true)
        turnstile.reset()
        onSuccess(
          result.is_duplicate
            ? 'This counter-notice was already received.'
            : 'Counter-notice received. A moderator will review its statutory requirements.',
        )
        router.push(`/copyright/notices/${noticeId}`)
      } catch (error) {
        onError(error, {
          fallback: 'We could not submit this counter-notice. Please try again.',
          tags: { form: 'copyright-counter-notice' },
        })
        turnstile.reset()
      }
    })
  }
  const complete = Object.values(values).every(value => value.trim())
  const declared = Object.values(declarations).every(Boolean)
  return (
    <form
      className='space-y-3'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <fieldset
        disabled={submitted}
        className='space-y-3 border-0 p-0'
      >
        <p className='text-sm text-muted-foreground'>
          A counter-notice states that material was removed by mistake or misidentification. It
          includes consent to federal jurisdiction and service of process.
        </p>
        <p className='text-sm text-muted-foreground'>
          If accepted, we will forward your name, address, telephone number, electronic signature,
          and declarations to the original claimant or their agent.
        </p>
        <LabeledInput
          id='copyright-counter-name'
          label='Full legal name'
          value={values.name}
          onChange={set('name')}
        />
        <div className='space-y-1'>
          <Label htmlFor='copyright-counter-address'>Mailing address</Label>
          <Textarea
            id='copyright-counter-address'
            value={values.address}
            onChange={event => setValues(current => ({ ...current, address: event.target.value }))}
            required
          />
        </div>
        <LabeledInput
          id='copyright-counter-telephone'
          label='Telephone'
          value={values.telephone}
          onChange={set('telephone')}
        />
        <LabeledInput
          id='copyright-counter-signature'
          label='Electronic signature'
          value={values.signature}
          onChange={set('signature')}
        />
        <DeclarationCheckbox
          id='copyright-counter-misidentification'
          checked={declarations.misidentification}
          onCheckedChange={checked =>
            setDeclarations(current => ({ ...current, misidentification: checked === true }))
          }
        >
          I state under penalty of perjury that I have a good-faith belief the material was removed
          or disabled because of mistake or misidentification.
        </DeclarationCheckbox>
        <TargetScopeSelector
          targetIds={targetIds}
          selectedTargetIds={selectedTargetIds}
          onChange={setSelectedTargetIds}
        />
        <DeclarationCheckbox
          id='copyright-counter-jurisdiction'
          checked={declarations.jurisdiction}
          onCheckedChange={checked =>
            setDeclarations(current => ({ ...current, jurisdiction: checked === true }))
          }
        >
          I consent to the jurisdiction of the Federal District Court for my address, or if my
          address is outside the United States, any district where Voucha may be found.
        </DeclarationCheckbox>
        <DeclarationCheckbox
          id='copyright-counter-service'
          checked={declarations.service}
          onCheckedChange={checked =>
            setDeclarations(current => ({ ...current, service: checked === true }))
          }
        >
          I accept service of process from the person who submitted the original notice or that
          person&apos;s agent.
        </DeclarationCheckbox>
        <TurnstileField turnstile={turnstile} />
        <Button
          type='submit'
          disabled={
            submitted ||
            pending ||
            !complete ||
            selectedTargetIds.length === 0 ||
            !turnstile.token ||
            !declared
          }
        >
          Submit counter-notice
        </Button>
      </fieldset>
    </form>
  )
}
