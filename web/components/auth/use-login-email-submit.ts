'use client'

import { useRef, type RefObject, type SyntheticEvent } from 'react'
import type { useResendCooldown } from '@/hooks/use-resend-cooldown'
import { sendEmailLoginToken } from '@/lib/api/client'
import { isEmailCodeRecentlySentError } from '@/lib/api/rate-limit-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError, { onSuccess } from '@/lib/on-error'

interface UseLoginEmailSubmitParams {
  cooldown: ReturnType<typeof useResendCooldown>
  email: string
  hpPhoneRef: RefObject<HTMLInputElement | null>
  hpWebsiteRef: RefObject<HTMLInputElement | null>
  setCapturedHpPhone: (value: string) => void
  setCapturedHpWebsite: (value: string) => void
  setLoading: (loading: boolean) => void
  setStep: (step: 'email' | 'code' | 'mfa') => void
  turnstile: { reset: () => void; token: string | null }
  uiLocale: string
}

/** Sends the first login code from the email step, one request at a time. */
export function useLoginEmailSubmit({
  cooldown,
  email,
  hpPhoneRef,
  hpWebsiteRef,
  setCapturedHpPhone,
  setCapturedHpWebsite,
  setLoading,
  setStep,
  turnstile,
  uiLocale,
}: UseLoginEmailSubmitParams) {
  const t = useTranslations()
  const inFlight = useRef(false)

  return async function handleEmailSubmit(e: SyntheticEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    const hpWebsite = hpWebsiteRef.current?.value ?? ''
    const hpPhone = hpPhoneRef.current?.value ?? ''
    setCapturedHpWebsite(hpWebsite)
    setCapturedHpPhone(hpPhone)
    setLoading(true)
    try {
      const result = await sendEmailLoginToken(
        email,
        turnstile.token ?? undefined,
        { hp_website: hpWebsite, hp_phone: hpPhone },
        uiLocale,
      )
      cooldown.startFromResponse(result)
      onSuccess(t('extracted.auth.loginForm.signInCodeSent_9a34e846'))
      setStep('code')
    } catch (err) {
      cooldown.startFromError(err)
      if (isEmailCodeRecentlySentError(err)) {
        // A code from the last minute is still valid, so continue to the code step.
        onSuccess(t('extracted.emailCodeResend.recentlySent'))
        setStep('code')
      } else {
        onError(err, {
          fallback: t('extracted.auth.loginForm.failedToSendVerificationCode_6401f8f4'),
          tags: { form: 'auth-login' },
        })
      }
    } finally {
      // The CAPTCHA token is single use and verified before the limiter, so every outcome spends it.
      turnstile.reset()
      inFlight.current = false
      setLoading(false)
    }
  }
}
