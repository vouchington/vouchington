'use client'

import { useState, useRef, useEffect } from 'react'
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { getMfaPasskeyOptions, verifyMfaPasskey, verifyMfaTotp } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess as notifySuccess } from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  loginAttemptId: string
  onSuccess: () => void
  onBack: () => void
}

export default function MfaStep({ loginAttemptId, onSuccess, onBack }: Props) {
  const t = useTranslations()
  const [totpCode, setTotpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const totpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    totpInputRef.current?.focus()
  }, [])

  function reportTotpError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      onError(new Error('Invalid verification code'), {
        fallback: t('extracted.auth.mfaStep.invalidVerificationCode_4ed23ad3'),
        tags: { form: 'auth-mfa' },
        skipSentry: true,
      })
    } else {
      onError(err, {
        fallback: t('extracted.auth.mfaStep.unableToVerifyPleaseTryAgain_b7979b96'),
        tags: { form: 'auth-mfa' },
      })
    }
    setTotpCode('')
    setLoading(false)
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totpCode.length < 6) return
    setLoading(true)
    try {
      await verifyMfaTotp<{ user: { id: string } }>(loginAttemptId, totpCode)
      notifySuccess(t('extracted.auth.mfaStep.verified_4f783840'))
      onSuccess()
    } catch (error) {
      reportTotpError(error)
    }
  }

  async function handlePasskey() {
    setLoading(true)
    try {
      const { options } = await getMfaPasskeyOptions<{
        options: PublicKeyCredentialRequestOptionsJSON
      }>(loginAttemptId)
      const authResponse = await startAuthentication({ optionsJSON: options })
      await verifyMfaPasskey(loginAttemptId, authResponse)
      notifySuccess(t('extracted.auth.mfaStep.verified_4f783840'))
      onSuccess()
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        onError(error, {
          fallback: t('extracted.auth.mfaStep.passkeyVerificationWasCancelled_11c1e88a'),
          tags: { form: 'auth-mfa' },
          skipSentry: true,
        })
      } else {
        onError(error, {
          fallback: t('extracted.auth.mfaStep.unableToVerifyPleaseTryAgain_b7979b96'),
          tags: { form: 'auth-mfa' },
        })
      }
      setLoading(false)
    }
  }

  function handleTotpChange(value: string) {
    setTotpCode(value)
    if (value.length === 6 && !loading) {
      setLoading(true)
      verifyMfaTotp<{ user: { id: string } }>(loginAttemptId, value)
        .then(() => {
          notifySuccess(t('extracted.auth.mfaStep.verified_4f783840'))
          onSuccess()
        })
        .catch((error: unknown) => {
          reportTotpError(error)
        })
    }
  }

  return (
    <div
      className='space-y-4'
      data-pw='mfa-step-container'
    >
      <p className='text-sm text-muted-foreground'>
        {t('extracted.auth.mfaStep.enterYourVerificationCodeOrUse_1ccf850c')}
      </p>

      {/* TOTP section */}
      <form
        onSubmit={handleTotpSubmit}
        className='space-y-3'
      >
        <div
          className='space-y-1'
          data-pw='mfa-totp-section'
        >
          <Label htmlFor='totp'>{t('extracted.auth.mfaStep.authenticatorCode_eab11173')}</Label>
          <InputOTP
            ref={totpInputRef}
            id='totp'
            maxLength={6}
            value={totpCode}
            onChange={handleTotpChange}
            disabled={loading}
            pattern={/^\d*$/}
            inputMode='numeric'
            data-pw='mfa-totp-input'
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button
          type='submit'
          className='h-11 w-full'
          loading={loading}
          disabled={loading || totpCode.length < 6}
        >
          {loading
            ? t('extracted.auth.mfaStep.verifying_2ec1ac7d')
            : t('extracted.auth.mfaStep.continue_31fbef16')}
        </Button>
      </form>

      {/* Divider */}
      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='w-full border-t' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background px-2 text-muted-foreground'>
            {t('extracted.auth.mfaStep.or_7175517a')}
          </span>
        </div>
      </div>

      {/* Passkey section */}
      <Button
        variant='outline'
        className='h-11 w-full'
        onClick={handlePasskey}
        disabled={loading}
        data-pw='mfa-passkey-button'
      >
        {t('extracted.auth.mfaStep.useAPasskey_b60b19cd')}
      </Button>

      <Button
        variant='ghost'
        size='sm'
        onClick={onBack}
        disabled={loading}
        data-pw='mfa-back-to-login-button'
      >
        {t('extracted.auth.mfaStep.backToLogin_3e3806ff')}
      </Button>
    </div>
  )
}
