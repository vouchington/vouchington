'use client'

import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

interface VerifyEmailFormProps {
  loading: boolean
  pendingEmail: string
  submitting: React.RefObject<boolean>
  token: string
  onCancel: () => void
  onSubmit: (event: React.FormEvent) => void
  setToken: (token: string) => void
  submitVerify: (token: string) => void
}

export function VerifyEmailForm({
  loading,
  pendingEmail,
  submitting,
  token,
  onCancel,
  onSubmit,
  setToken,
  submitVerify,
}: VerifyEmailFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSubmit}
      className='space-y-3'
    >
      <p className='text-sm text-muted-foreground'>
        {t('extracted.emailManager.verifyEmailForm.enterTheVerificationCodeSentTo_b53551d7')}{' '}
        <strong>{pendingEmail}</strong>
      </p>
      <div className='space-y-1'>
        <Label htmlFor='verify-token'>
          {t('extracted.emailManager.verifyEmailForm.verificationCode_3ee75029')}
        </Label>
        <InputOTP
          id='verify-token'
          name='verification-code'
          maxLength={8}
          value={token}
          disabled={loading}
          onChange={(value: string) => {
            const upper = value.toUpperCase()
            setToken(upper)
            if (upper.length === 8 && !submitting.current) submitVerify(upper)
          }}
          pattern={/^[0-9A-Fa-f]*$/}
          inputMode='text'
          autoComplete='one-time-code'
          spellCheck={false}
          autoCorrect='off'
          autoCapitalize='characters'
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
            <InputOTPSlot index={6} />
            <InputOTPSlot index={7} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={loading}
          disabled={loading || token.length < 8}
        >
          {loading
            ? t('extracted.emailManager.verifyEmailForm.verifying_2ec1ac7d')
            : t('extracted.emailManager.verifyEmailForm.verify_eea2745e')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.emailManager.verifyEmailForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
