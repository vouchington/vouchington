'use client'

import { useRef } from 'react'
import { loginWithEmailAddress, sendEmailLoginToken } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import { toast } from 'sonner'

interface UseLoginCodeActionsParams {
  capturedHpPhone: string
  capturedHpWebsite: string
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
  email,
  handleLoginSuccess,
  handleTurnstileReset,
  setLoginAttemptId,
  setLoading,
  setStep,
  turnstileToken,
  uiLocale,
}: UseLoginCodeActionsParams) {
  const submitting = useRef(false)

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
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
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
    if (!turnstileToken) return
    setLoading(true)
    try {
      await sendEmailLoginToken(
        email,
        turnstileToken,
        {
          hp_website: capturedHpWebsite,
          hp_phone: capturedHpPhone,
        },
        uiLocale,
      )
      toast.info(`Verification code resent to ${email}`)
      handleTurnstileReset()
    } catch (error) {
      const message =
        error instanceof ApiError
          ? ((error.data as { message?: string })?.message ?? error.message)
          : 'Failed to resend verification code'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return { handleResendCode, submitCode, submitting }
}
