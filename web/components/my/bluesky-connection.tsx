'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { beginBlueskyAccountLink, disconnectBlueskyAccount } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags'
import type { BlueskyAccountInfo } from '@/types/user'

// Mirrors the bluesky_error codes GET /api/v1/auth/bluesky/callback redirects with — see
// backend/api/v1/sessions-authentication/auth-bluesky.mts.
const BLUESKY_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'The Bluesky sign-in link was invalid or expired. Please try again.',
  session_expired: 'Your Bluesky sign-in session expired. Please try again.',
  already_linked: 'That Bluesky account is already linked to a different Voucha account.',
  account_suspended: 'Your Voucha account is suspended. Your Bluesky account was not connected.',
  not_logged_in:
    'You were signed out before Bluesky sign-in finished. Please log in and try again.',
  session_mismatch:
    'This Bluesky sign-in was started from a different session. Please try again from this account.',
  unknown: 'Failed to link your Bluesky account. Please try again.',
}

interface Props {
  initialAccount: BlueskyAccountInfo | null
}

export function BlueskyConnection(props: Props) {
  return (
    <Suspense fallback={null}>
      <BlueskyConnectionContent {...props} />
    </Suspense>
  )
}

function BlueskyConnectionContent({ initialAccount }: Props) {
  const featureFlags = useFeatureFlags()
  const fediverseEnabled = featureFlags.fediverse === true
  const router = useRouter()
  const searchParams = useSearchParams()
  const [account, setAccount] = useState(initialAccount)
  const [handle, setHandle] = useState('')
  const [linking, setLinking] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const callbackHandledRef = useRef(false)

  // The OAuth callback (GET /api/v1/auth/bluesky/callback) is a one-shot redirect with no other
  // way to signal success/failure back to this page — read it once on mount, flash a toast, then
  // strip the params so a refresh doesn't re-fire the toast.
  useEffect(() => {
    if (!fediverseEnabled || callbackHandledRef.current) return
    const linked = searchParams.get('bluesky')
    const error = searchParams.get('bluesky_error')
    if (!linked && !error) return
    callbackHandledRef.current = true

    if (linked === 'linked') toast.success('Bluesky account connected')
    else if (error) toast.error(BLUESKY_ERROR_MESSAGES[error] ?? BLUESKY_ERROR_MESSAGES.unknown)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('bluesky')
    params.delete('bluesky_error')
    const query = params.toString()
    router.replace(query ? `?${query}` : window.location.pathname, { scroll: false })
  }, [fediverseEnabled, searchParams, router])

  if (!fediverseEnabled) return null

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    setLinking(true)
    try {
      const { redirect_url } = await beginBlueskyAccountLink(handle.trim())
      // Defense in depth against an open-redirect-shaped response — mirrors CheckoutButton's
      // Stripe redirect guard (web/components/memberships/checkout-button.tsx).
      if (new URL(redirect_url).protocol !== 'https:') {
        toast.error('Bluesky sign-in redirect URL is not secure. Please try again.')
        setLinking(false)
        return
      }
      window.location.assign(redirect_url)
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting a Bluesky link-begin failure */
      const message = error instanceof ApiError ? error.message : 'Failed to start Bluesky sign-in'
      toast.error(message)
      setLinking(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await disconnectBlueskyAccount()
      setAccount(null)
      toast.success('Bluesky account disconnected')
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting a Bluesky disconnect failure */
      const message =
        error instanceof ApiError ? error.message : 'Failed to disconnect Bluesky account'
      toast.error(message)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className='space-y-4'>
      <h2
        className='text-lg font-semibold'
        data-pw='bluesky-connection-heading'
      >
        Bluesky
      </h2>
      {account ? (
        <div className='flex items-center gap-3 rounded-md border p-4'>
          <div className='flex-1'>
            <p
              className='text-sm font-medium'
              data-pw='bluesky-connection-handle'
            >
              {account.handle ?? account.did}
            </p>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={handleDisconnect}
            loading={disconnecting}
            disabled={disconnecting}
            data-pw='bluesky-connection-disconnect-button'
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleLink}
          className='space-y-3'
        >
          <div className='space-y-1'>
            <Label htmlFor='bluesky-handle'>Bluesky handle</Label>
            <Input
              id='bluesky-handle'
              name='bluesky-handle'
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder='you.bsky.social'
              autoComplete='off'
              spellCheck={false}
              autoCapitalize='none'
              required
              data-pw='bluesky-connection-handle-input'
            />
          </div>
          <Button
            type='submit'
            loading={linking}
            disabled={linking || !handle.trim()}
            data-pw='bluesky-connection-connect-button'
          >
            {linking ? 'Connecting...' : 'Connect'}
          </Button>
        </form>
      )}
    </div>
  )
}
