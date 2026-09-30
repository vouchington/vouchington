'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
} from '@/lib/api/client/copyright-guest'
import onError, { onSuccess } from '@/lib/on-error'
import { LabeledInput, LabeledTextarea } from './copyright-form-fields'
import {
  toDateTimeLocalValue,
  useCopyrightGuestCapabilities,
} from './copyright-staff-guest-capability-list'
import { CopyrightGuestCapabilityRows } from './copyright-staff-guest-capability-rows'

const maxLifetimeMs = 30 * 24 * 60 * 60 * 1000

function latestExpiry() {
  return toDateTimeLocalValue(Date.now() + maxLifetimeMs)
}

export function CopyrightStaffGuestCapability({ noticeId }: { noticeId: string }) {
  const capabilities = useCopyrightGuestCapabilities(noticeId)
  const [maxExpiry, setMaxExpiry] = useState(() => latestExpiry())
  const [expiresAt, setExpiresAt] = useState('')
  const [issued, setIssued] = useState<{ id: string; token: string } | null>(null)
  const [requestFor, setRequestFor] = useState<string | null>(null)
  const [statement, setStatement] = useState('')
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  function run(action: () => Promise<void>, fallback: string) {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    void (async () => {
      try {
        await action()
      } catch (error) {
        onError(error, { fallback })
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    })()
  }
  function issue() {
    if (!expiresAt) return
    run(async () => {
      const response = await issueCopyrightGuestCapability(
        noticeId,
        new Date(expiresAt).toISOString(),
      )
      const { id, token } = response.copyright_guest_capability
      setIssued({ id, token })
      capabilities.reload()
      onSuccess('Guest access issued. Copy the token now. It is shown once.')
    }, 'Could not issue guest access')
  }
  function revoke(capabilityId: string) {
    run(async () => {
      await revokeCopyrightGuestCapability(noticeId, capabilityId)
      if (issued?.id === capabilityId) setIssued(null)
      if (requestFor === capabilityId) setRequestFor(null)
      capabilities.reload()
      onSuccess('Guest access revoked.')
    }, 'Could not revoke guest access')
  }
  function requestInformation() {
    const capabilityId = requestFor
    if (!capabilityId || !statement.trim()) return
    run(async () => {
      await requestCopyrightGuestInformation(noticeId, capabilityId, statement.trim())
      setStatement('')
      setRequestFor(null)
      onSuccess('Information request recorded. Guest access expiry is unchanged.')
    }, 'Could not request information')
  }
  return (
    <section className='space-y-3'>
      <h3 className='font-semibold'>Guest access</h3>
      <p className='text-sm text-muted-foreground'>
        The claimant opens /copyright/notices/{noticeId}/guest and enters a token. Access lasts at
        most 30 days and ends when the notice is withdrawn.
      </p>
      <LabeledInput
        id={`guest-expires-${noticeId}`}
        label='Access expires'
        type='datetime-local'
        max={maxExpiry}
        onFocus={() => setMaxExpiry(latestExpiry())}
        value={expiresAt}
        onChange={event => setExpiresAt(event.target.value)}
      />
      <Button
        type='button'
        disabled={pending}
        onClick={issue}
      >
        Issue guest access
      </Button>
      {issued && (
        <LabeledInput
          id={`guest-token-${noticeId}`}
          label='Access token'
          readOnly
          value={issued.token}
        />
      )}
      <CopyrightGuestCapabilityRows
        list={capabilities}
        pending={pending}
        onRequest={setRequestFor}
        onRevoke={revoke}
        onLoadOlder={() => run(capabilities.loadOlder, 'Could not load older guest access')}
      />
      {requestFor && (
        <>
          <LabeledTextarea
            id={`guest-request-${noticeId}`}
            label='Information request'
            value={statement}
            onChange={event => setStatement(event.target.value)}
          />
          <Button
            type='button'
            disabled={pending}
            onClick={requestInformation}
          >
            Send information request
          </Button>
        </>
      )}
    </section>
  )
}
