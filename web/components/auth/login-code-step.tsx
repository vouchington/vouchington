/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useRef, useEffect, type SyntheticEvent } from 'react'
import {
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_INPUT_PATTERN,
  LOGIN_CODE_PATTERN,
} from '@ts-shared/utils/login-code'
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
          maxLength={LOGIN_CODE_LENGTH}
          value={code}
          disabled={loading}
          onChange={onCodeChange}
          pattern={LOGIN_CODE_INPUT_PATTERN}
          inputMode='text'
          autoComplete='one-time-code'
          spellCheck={false}
          autoCorrect='off'
          autoCapitalize='characters'
          data-pw='login-verification-code-input'
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
          type='submit'
          className='h-11 flex-1'
          loading={loading}
          disabled={loading || !LOGIN_CODE_PATTERN.test(code)}
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
