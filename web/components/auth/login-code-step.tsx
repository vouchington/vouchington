/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useRef, useEffect, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

interface LoginCodeStepProps {
  active: boolean
  code: string
  email: string
  loading: boolean
  onBack: () => void
  onCodeChange: (value: string) => void
  onResendCode: () => Promise<void>
  onSubmit: (e: SyntheticEvent) => Promise<void>
  turnstileReady: boolean
}

export function LoginCodeStep({
  active,
  code,
  email,
  loading,
  onBack,
  onCodeChange,
  onResendCode,
  onSubmit,
  turnstileReady,
}: LoginCodeStepProps) {
  const t = useTranslations()
  const otpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (active) {
      otpInputRef.current?.focus({ preventScroll: true })
    }
  }, [active])

  if (!active) return null

  return (
    <form
      onSubmit={onSubmit}
      className='space-y-4'
    >
      <p className='text-sm text-muted-foreground'>
        {t('extracted.auth.loginCodeStep.enterTheVerificationCodeSentTo_b53551d7')}{' '}
        <strong>{email}</strong>
      </p>
      <div className='space-y-1'>
        <Label htmlFor='code'>{t('extracted.auth.loginCodeStep.verificationCode_3ee75029')}</Label>
        <InputOTP
          ref={otpInputRef}
          id='code'
          name='verification-code'
          maxLength={8}
          value={code}
          disabled={loading}
          onChange={onCodeChange}
          pattern={/^[0-9A-Fa-f]*$/}
          inputMode='text'
          autoComplete='one-time-code'
          spellCheck={false}
          autoCorrect='off'
          autoCapitalize='characters'
          data-pw='login-verification-code-input'
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
          className='h-11 flex-1'
          loading={loading}
          disabled={loading || code.length < 8}
          data-pw='login-code-submit-button'
        >
          {loading ? 'Verifying...' : 'Log in'}
        </Button>
        <Button
          type='button'
          variant='outline'
          className='h-11'
          onClick={onBack}
          data-pw='login-code-back-button'
        >
          {t('extracted.auth.loginCodeStep.back_76900f1b')}
        </Button>
      </div>
      <p className='text-center text-xs text-muted-foreground'>
        {t('extracted.auth.loginCodeStep.didnTReceiveACode_dcbabd0d')}{' '}
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-auto p-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground'
          disabled={loading || !turnstileReady}
          onClick={onResendCode}
        >
          {t('extracted.auth.loginCodeStep.resendCode_b9745740')}
        </Button>
      </p>
    </form>
  )
}
