'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { OAuthCancelledError } from '@/lib/auth/oauth-error'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'
import type { OAuthProvider } from '@/types/user'
import { ProviderIcon } from './oauth-provider-icons'

export interface OAuthButtonProps {
  onToken: (token: OAuthLoginToken) => Promise<void>
  disabled?: boolean
  onAvailabilityChange?: (available: boolean) => void
}

interface AuthState {
  isAvailable: boolean
  isLoaded: boolean
}

export function ProviderButton({
  label,
  auth,
  onToken,
  disabled,
  getToken,
  provider,
  buttonClassName,
  onAvailabilityChange,
}: {
  label: string
  auth: AuthState
  getToken: () => Promise<OAuthLoginToken>
  provider: OAuthProvider
  buttonClassName: string
} & OAuthButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)
  useEffect(() => {
    onAvailabilityChange?.(auth.isAvailable)
  }, [auth.isAvailable, onAvailabilityChange])
  if (!auth.isAvailable) return null

  async function signInWithProvider() {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    try {
      await onToken(await getToken())
    } catch (error) {
      if (!(error instanceof OAuthCancelledError)) {
        const message =
          error instanceof Error ? error.message : 'Authentication failed. Please try again.'
        toast.error(message)
      }
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  const buttonLabel = isSubmitting ? 'Connecting...' : `Continue with ${label}`

  return (
    <Button
      type='button'
      variant='outline'
      className={`w-full justify-center gap-3 ${buttonClassName}`}
      onClick={signInWithProvider}
      loading={isSubmitting}
      disabled={!auth.isLoaded || isSubmitting || disabled}
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`oauth-provider-button-${provider}`}
    >
      {!isSubmitting && (
        <span className='shrink-0'>
          <ProviderIcon provider={provider} />
        </span>
      )}
      {buttonLabel}
    </Button>
  )
}
