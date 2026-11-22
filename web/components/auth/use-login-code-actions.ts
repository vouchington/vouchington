'use client'

import { useRef } from 'react'
import { loginWithEmailAddress, sendEmailLoginToken } from '@/lib/api/client'
import { ApiError } from '@vouchington/api-client'
import { toast } from 'sonner'
import type { useResendCooldown } from '@/hooks/use-resend-cooldown'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UseLoginCodeActionsParams {
  capturedHpPhone: string
  capturedHpWebsite: string
  cooldown: ReturnType<typeof useResendCooldown>
  email: string
  handleLoginSuccess: () => void
  handleTurnstileReset: () => void
  setLoginAttemptId: (id: string) => void
  setLoading: (loading: boolean) => void
  setStep: (step: 'email' | 'code' | 'mfa') => void
  turnstileToken: string | null
  uiLocale: string
}

export function useLoginCodeActions({
  capturedHpPhone,
  capturedHpWebsite,
  cooldown,
  email,
  handleLoginSuccess,
  handleTurnstileReset,
  setLoginAttemptId,
  setLoading,
  setStep,
  turnstileToken,
  uiLocale,
}: UseLoginCodeActionsParams) {
  const t = useTranslations()
  const submitting = useRef(false)
  const resendInFlight = useRef(false)

  const submitCode = async (value: string) => {
    submitting.current = true
    setLoading(true)
    let shouldResetLoading = true
    try {
      const result = await loginWithEmailAddress<{
        mfa_required?: boolean
        login_attempt_id?: string
      }>(email, value, {
        hp_website: capturedHpWebsite,
        hp_phone: capturedHpPhone,
      })
      if (result.mfa_required && result.login_attempt_id) {
        setLoginAttemptId(result.login_attempt_id)
        setStep('mfa')
        shouldResetLoading = true
        return
      }
      shouldResetLoading = false
      handleLoginSuccess()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Invalid or expired verification code')
      } else {
        toast.error('Unable to connect. Please try again.')
      }
    } finally {
      submitting.current = false
      if (shouldResetLoading) {
        setLoading(false)
      }
    }
  }

  const handleResendCode = async () => {
    if (!turnstileToken || resendInFlight.current || cooldown.secondsLeft > 0) return
    resendInFlight.current = true
    setLoading(true)
    try {
      const result = await sendEmailLoginToken(
        email,
        turnstileToken,
        {
          hp_website: capturedHpWebsite,
          hp_phone: capturedHpPhone,
        },
        uiLocale,
      )
      cooldown.startFromResponse(result)
      toast.info(`Verification code resent to ${email}`)
      handleTurnstileReset()
    } catch (err) {
      cooldown.startFromError(err)
      onError(err, {
        fallback: t('extracted.auth.loginForm.failedToSendVerificationCode_6401f8f4'),
        tags: { form: 'auth-login' },
      })
    } finally {
      resendInFlight.current = false
      setLoading(false)
    }
  }

  return { handleResendCode, submitCode, submitting }
}
