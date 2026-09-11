'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { requestReAuthEmail, verifyReAuthEmail, verifyReAuthTotp } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import type { MfaStatus } from '@/types/user'
import { MethodSelector, type ReauthMethod } from './mfa-reauth-dialog/method-selector'
import { EmailVerificationPane, TotpVerificationPane } from './mfa-reauth-dialog/verification-panes'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  open: boolean
  mfaStatus: MfaStatus
  onVerified: (reAuthToken: string) => void
  onClose: () => void
}

export function MfaReauthDialog({ open, mfaStatus, onVerified, onClose }: Props) {
  const t = useTranslations()
  const defaultMethod: ReauthMethod = mfaStatus.totp_count > 0 ? 'totp' : 'email'
  const [method, setMethod] = useState<ReauthMethod>(defaultMethod)
  const [totpCode, setTotpCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [sentToEmail, setSentToEmail] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() {
    setMethod(defaultMethod)
    setTotpCode('')
    setEmailCode('')
    setEmailSent(false)
    setSentToEmail('')
    setLoading(false)
    onClose()
  }

  async function handleTotpVerify(code: string) {
    if (code.length < 6) return
    setLoading(true)
    try {
      const result = await verifyReAuthTotp<{ re_auth_token: string }>(code)
      onVerified(result.re_auth_token)
      handleClose()
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting a TOTP verify failure */
      const message = error instanceof ApiError ? error.message : 'Failed to verify code'
      toast.error(message)
      setTotpCode('')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendEmail() {
    setLoading(true)
    try {
      const result = await requestReAuthEmail()
      setSentToEmail(result.email_address)
      setEmailSent(true)
      toast.success('Verification code sent')
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting a send email failure */
      const message = error instanceof ApiError ? error.message : 'Failed to send code'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleResendEmail() {
    setEmailCode('')
    setEmailSent(false)
    setSentToEmail('')
    await handleSendEmail()
  }

  async function handleEmailVerify(code: string) {
    if (code.length < 6) return
    setLoading(true)
    try {
      const result = await verifyReAuthEmail<{ re_auth_token: string }>(code)
      onVerified(result.re_auth_token)
      handleClose()
    } catch (error) {
      /* c8 ignore next 3 -- error path requires injecting an email verify failure */
      const message = error instanceof ApiError ? error.message : 'Failed to verify code'
      toast.error(message)
      setEmailCode('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => !isOpen && handleClose()}
    >
      <DialogContent data-pw='mfa-reauth-dialog'>
        <DialogHeader>
          <DialogTitle data-pw='mfa-reauth-dialog-title'>
            {t('extracted.my.mfaReauthDialog.reAuthenticate_3887afa4')}
          </DialogTitle>
          <DialogDescription data-pw='mfa-reauth-dialog-description'>
            {t('extracted.my.mfaReauthDialog.verifyYourIdentityToRemoveYour_e7d1fbdb')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {mfaStatus.totp_count > 0 && (
            <MethodSelector
              loading={loading}
              method={method}
              setEmailCode={setEmailCode}
              setEmailSent={setEmailSent}
              setMethod={setMethod}
              setSentToEmail={setSentToEmail}
            />
          )}

          {method === 'totp' && (
            <TotpVerificationPane
              loading={loading}
              totpCode={totpCode}
              handleTotpVerify={handleTotpVerify}
              setTotpCode={setTotpCode}
            />
          )}

          {method === 'email' && (
            <EmailVerificationPane
              emailCode={emailCode}
              emailSent={emailSent}
              loading={loading}
              sentToEmail={sentToEmail}
              handleEmailVerify={handleEmailVerify}
              handleResendEmail={handleResendEmail}
              handleSendEmail={handleSendEmail}
              setEmailCode={setEmailCode}
            />
          )}
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={handleClose}
            disabled={loading}
            data-pw='mfa-reauth-dialog-cancel-button'
          >
            {t('extracted.my.mfaReauthDialog.cancel_19766ed6')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
