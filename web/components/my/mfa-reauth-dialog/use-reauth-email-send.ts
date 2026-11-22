'use client'

import { useRef } from 'react'
import { toast } from 'sonner'
import { useResendCooldown } from '@/hooks/use-resend-cooldown'
import { requestReAuthEmail } from '@/lib/api/client'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'

/** Sends the re-auth email code once per call and keeps resend disabled for the server interval. */
export function useReAuthEmailSend({
  onSent,
  setLoading,
}: {
  onSent: (emailAddress: string) => void
  setLoading: (loading: boolean) => void
}) {
  const t = useTranslations()
  const inFlight = useRef(false)
  const cooldown = useResendCooldown()

  async function sendEmail() {
    if (inFlight.current || cooldown.secondsLeft > 0) return
    inFlight.current = true
    setLoading(true)
    try {
      const result = await requestReAuthEmail()
      onSent(result.email_address)
      cooldown.startFromResponse(result)
      toast.success('Verification code sent')
    } catch (err) {
      cooldown.startFromError(err)
      onError(err, {
        fallback: t('extracted.auth.loginForm.failedToSendVerificationCode_6401f8f4'),
        tags: { form: 'account-reauth' },
      })
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  return { resendSecondsLeft: cooldown.secondsLeft, sendEmail }
}
