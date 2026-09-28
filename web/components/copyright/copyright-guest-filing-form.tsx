'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import {
  submitCopyrightGuestFiling,
  type CopyrightGuestFilingKind,
} from '@/lib/api/client/copyright-guest'
import onError, { onSuccess } from '@/lib/on-error'
import { LabeledInput, LabeledTextarea } from './copyright-form-fields'

const filingKinds: { value: CopyrightGuestFilingKind; label: string }[] = [
  { value: 'supplement', label: 'Correction' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'court_or_ccb_hold', label: 'Court or CCB filing' },
]

export function CopyrightGuestFilingForm({ noticeId }: { noticeId: string }) {
  const turnstile = useTurnstileToken()
  const [token, setToken] = useState('')
  const [kind, setKind] = useState<CopyrightGuestFilingKind>('supplement')
  const [statement, setStatement] = useState('')
  const [pending, startTransition] = useTransition()
  function submit() {
    if (!token.trim() || !statement.trim() || !turnstile.token || pending) return
    startTransition(async () => {
      try {
        await submitCopyrightGuestFiling({
          noticeId,
          token: token.trim(),
          kind,
          statement: statement.trim(),
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        onSuccess('Filing received. It does not change the original receipt time.')
        setStatement('')
        turnstile.reset()
      } catch (error) {
        onError(error, { title: 'Could not file' })
      }
    })
  }
  return (
    <form
      className='space-y-4'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <LabeledInput
        id='guest-capability-token'
        label='Case access token'
        autoComplete='off'
        type='password'
        value={token}
        onChange={event => setToken(event.target.value)}
      />
      <div className='space-y-1'>
        <label
          className='text-sm font-medium'
          htmlFor='guest-filing-kind'
        >
          Filing
        </label>
        <select
          className='border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm'
          id='guest-filing-kind'
          value={kind}
          onChange={event => setKind(event.target.value as CopyrightGuestFilingKind)}
        >
          {filingKinds.map(option => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <LabeledTextarea
        id='guest-filing-statement'
        label='Statement'
        value={statement}
        onChange={event => setStatement(event.target.value)}
      />
      <TurnstileField turnstile={turnstile} />
      <Button
        type='submit'
        disabled={pending}
      >
        Submit filing
      </Button>
    </form>
  )
}
