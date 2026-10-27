'use client'

import {
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_INPUT_PATTERN,
  LOGIN_CODE_PATTERN,
} from '@ts-shared/utils/login-code'
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
          maxLength={LOGIN_CODE_LENGTH}
          value={token}
          disabled={loading}
          onChange={(value: string) => {
            const upper = value.toUpperCase()
            setToken(upper)
            if (LOGIN_CODE_PATTERN.test(upper) && !submitting.current) submitVerify(upper)
          }}
          pattern={LOGIN_CODE_INPUT_PATTERN}
          inputMode='text'
          autoComplete='one-time-code'
          spellCheck={false}
          autoCorrect='off'
          autoCapitalize='characters'
        >
          {[0, 1].map(group => (
            <span
              key={group}
              className='contents'
            >
              {group === 1 && <InputOTPSeparator />}
              <InputOTPGroup>
                {[0, 1, 2, 3, 4].map(slot => (
                  <InputOTPSlot
                    key={slot}
                    index={group * (LOGIN_CODE_LENGTH / 2) + slot}
                    className='h-9 w-6 sm:h-10 sm:w-8'
                  />
                ))}
              </InputOTPGroup>
            </span>
          ))}
        </InputOTP>
      </div>
      <div className='flex gap-2'>
        <Button
          data-pw='verify-email-form-verify'
          type='submit'
          loading={loading}
          disabled={loading || !LOGIN_CODE_PATTERN.test(token)}
        >
          {loading
            ? t('extracted.emailManager.verifyEmailForm.verifying_2ec1ac7d')
            : t('extracted.emailManager.verifyEmailForm.verify_eea2745e')}
        </Button>
        <Button
          data-pw='verify-email-form-cancel'
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
