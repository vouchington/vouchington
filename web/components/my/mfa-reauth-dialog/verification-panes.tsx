'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TotpVerificationPaneProps {
  loading: boolean
  totpCode: string
  handleTotpVerify: (code: string) => void
  setTotpCode: (code: string) => void
}

export function TotpVerificationPane({
  loading,
  totpCode,
  handleTotpVerify,
  setTotpCode,
}: TotpVerificationPaneProps) {
  const t = useTranslations()
  const labelId = useId()

  return (
    <div className='space-y-3'>
      <Label id={labelId}>
        {t('extracted.mfaReauthDialog.verificationPanes.enterThe6DigitCodeFrom_a160dee6')}
      </Label>
      <SixDigitOtp
        code={totpCode}
        labelId={labelId}
        loading={loading}
        setCode={setTotpCode}
        onComplete={handleTotpVerify}
      />
      <Button
        onClick={() => handleTotpVerify(totpCode)}
        loading={loading}
        disabled={loading || totpCode.length < 6}
      >
        {loading
          ? t('extracted.mfaReauthDialog.verificationPanes.verifying_2ec1ac7d')
          : t('extracted.mfaReauthDialog.verificationPanes.verify_eea2745e')}
      </Button>
    </div>
  )
}

interface EmailVerificationPaneProps {
  emailCode: string
  emailSent: boolean
  loading: boolean
  sentToEmail: string
  handleEmailVerify: (code: string) => void
  handleResendEmail: () => void
  handleSendEmail: () => void
  setEmailCode: (code: string) => void
}

export function EmailVerificationPane({
  emailCode,
  emailSent,
  loading,
  sentToEmail,
  handleEmailVerify,
  handleResendEmail,
  handleSendEmail,
  setEmailCode,
}: EmailVerificationPaneProps) {
  const t = useTranslations()
  const labelId = useId()

  if (!emailSent) {
    return (
      <div className='space-y-3'>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.mfaReauthDialog.verificationPanes.weLlSendAVerificationCode_fc0ed3b9')}
        </p>
        <Button
          onClick={handleSendEmail}
          loading={loading}
          disabled={loading}
        >
          {loading
            ? t('extracted.mfaReauthDialog.verificationPanes.sending_286a3af7')
            : t('extracted.mfaReauthDialog.verificationPanes.sendCode_66a5b409')}
        </Button>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <p className='text-sm text-muted-foreground'>
        {t('extracted.mfaReauthDialog.verificationPanes.aVerificationCodeWasSentTo_7ff88c72')}{' '}
        <strong>{sentToEmail}</strong>.
      </p>
      <Label id={labelId}>
        {t('extracted.mfaReauthDialog.verificationPanes.enterThe6DigitCodeFrom_888a9edc')}
      </Label>
      <SixDigitOtp
        code={emailCode}
        labelId={labelId}
        loading={loading}
        setCode={setEmailCode}
        onComplete={handleEmailVerify}
      />
      <div className='flex gap-2'>
        <Button
          onClick={() => handleEmailVerify(emailCode)}
          loading={loading}
          disabled={loading || emailCode.length < 6}
        >
          {loading
            ? t('extracted.mfaReauthDialog.verificationPanes.verifying_2ec1ac7d')
            : t('extracted.mfaReauthDialog.verificationPanes.verify_eea2745e')}
        </Button>
        <Button
          variant='outline'
          onClick={handleResendEmail}
          disabled={loading}
        >
          {t('extracted.mfaReauthDialog.verificationPanes.resend_1f948437')}
        </Button>
      </div>
    </div>
  )
}

function SixDigitOtp({
  code,
  labelId,
  loading,
  onComplete,
  setCode,
}: {
  code: string
  labelId: string
  loading: boolean
  onComplete: (code: string) => void
  setCode: (code: string) => void
}) {
  return (
    <InputOTP
      maxLength={6}
      value={code}
      aria-labelledby={labelId}
      onChange={(value: string) => {
        setCode(value)
        if (value.length === 6) onComplete(value)
      }}
      disabled={loading}
      pattern={/^\d*$/}
      inputMode='numeric'
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
  )
}
