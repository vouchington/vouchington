'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
} from '@/lib/api/client/copyright-guest'
import onError, { onSuccess } from '@/lib/on-error'
import { LabeledInput, LabeledTextarea } from './copyright-form-fields'

export function CopyrightStaffGuestCapability({ noticeId }: { noticeId: string }) {
  const [expiresAt, setExpiresAt] = useState('')
  const [capabilityId, setCapabilityId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [statement, setStatement] = useState('')
  const [pending, startTransition] = useTransition()
  function issue() {
    if (!expiresAt || pending) return
    startTransition(async () => {
      try {
        const issued = await issueCopyrightGuestCapability(
          noticeId,
          new Date(expiresAt).toISOString(),
        )
        setCapabilityId(issued.copyright_guest_capability.id)
        setToken(issued.copyright_guest_capability.token)
        onSuccess('Guest access issued. Copy the token now. It is shown once.')
      } catch (error) {
        onError(error, { fallback: 'Could not issue guest access' })
      }
    })
  }
  function requestInformation() {
    if (!capabilityId || !statement.trim() || pending) return
    startTransition(async () => {
      try {
        await requestCopyrightGuestInformation(noticeId, capabilityId, statement.trim())
        setStatement('')
        onSuccess('Information request recorded. Guest access expiry is unchanged.')
      } catch (error) {
        onError(error, { fallback: 'Could not request information' })
      }
    })
  }
  function revoke() {
    if (!capabilityId || pending) return
    startTransition(async () => {
      try {
        await revokeCopyrightGuestCapability(noticeId, capabilityId)
        setToken(null)
        onSuccess('Guest access revoked.')
      } catch (error) {
        onError(error, { fallback: 'Could not revoke guest access' })
      }
    })
  }
  return (
    <section className='space-y-3'>
      <h3 className='font-semibold'>Guest access</h3>
      <p className='text-sm text-muted-foreground'>
        The claimant opens /copyright/notices/{noticeId}/guest and enters this token.
      </p>
      <LabeledInput
        id={`guest-expires-${noticeId}`}
        label='Access expires'
        type='datetime-local'
        value={expiresAt}
        onChange={event => setExpiresAt(event.target.value)}
      />
      <div className='flex gap-2'>
        <Button
          type='button'
          disabled={pending}
          onClick={issue}
        >
          Issue guest access
        </Button>
        <Button
          type='button'
          variant='outline'
          disabled={pending || !capabilityId}
          onClick={revoke}
        >
          Revoke
        </Button>
      </div>
      {token && (
        <LabeledInput
          id={`guest-token-${noticeId}`}
          label='Access token'
          readOnly
          value={token}
        />
      )}
      <LabeledTextarea
        id={`guest-request-${noticeId}`}
        label='Information request'
        value={statement}
        onChange={event => setStatement(event.target.value)}
      />
      <Button
        type='button'
        disabled={pending || !capabilityId}
        onClick={requestInformation}
      >
        Request information
      </Button>
    </section>
  )
}
