'use client'

import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { getDiscoverablePasskeyOptions, verifyDiscoverablePasskey } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'

interface UsePasskeySignInParams {
  handleLoginSuccess: () => void
  setLoading: (loading: boolean) => void
}

export function usePasskeySignIn({ handleLoginSuccess, setLoading }: UsePasskeySignInParams) {
  async function handlePasskeySignIn() {
    setLoading(true)
    let shouldResetLoading = true
    try {
      const { options } = await getDiscoverablePasskeyOptions<{
        options: PublicKeyCredentialRequestOptionsJSON
      }>()
      const authResponse = await startAuthentication({ optionsJSON: options })
      await verifyDiscoverablePasskey(authResponse)
      onSuccess('Signed in')
      // Navigation unmounts the form — do not reset loading after this point
      shouldResetLoading = false
      handleLoginSuccess()
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        onError(err, {
          fallback: 'Passkey sign-in was cancelled',
          tags: { form: 'auth-login' },
          skipSentry: true,
        })
      } else if (err instanceof ApiError && err.status === 401) {
        onError(err, {
          fallback: 'Passkey sign-in failed. Please try again.',
          tags: { form: 'auth-login' },
          skipSentry: true,
        })
      } else {
        onError(err, {
          fallback: 'Unable to sign in with passkey. Please try again.',
          tags: { form: 'auth-login' },
        })
      }
    } finally {
      if (shouldResetLoading) {
        setLoading(false)
      }
    }
  }

  return { handlePasskeySignIn }
}
