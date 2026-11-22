'use client'

import dynamic from 'next/dynamic'
import type { RefObject, SyntheticEvent } from 'react'
import { LoginCodeStep } from './login-code-step'
import type MfaStepComponent from './mfa-step'

const MfaStep = dynamic<Parameters<typeof MfaStepComponent>[0]>(() => import('./mfa-step'))

interface LoginCodePanelProps {
  active: boolean
  code: string
  email: string
  loading: boolean
  loginAttemptId: string
  onResendCode: () => Promise<void>
  resendSecondsLeft: number
  setCode: (code: string) => void
  setLoginAttemptId: (loginAttemptId: string) => void
  setStep: (step: 'email' | 'code' | 'mfa') => void
  setTurnstileToken: (token: string | null) => void
  step: 'email' | 'code' | 'mfa'
  submitCode: (value: string) => Promise<void>
  submitting: RefObject<boolean>
  turnstileReset: () => void
  turnstileToken: string | null
  onLoginSuccess: () => void
}

export function LoginCodePanel({
  active,
  code,
  email,
  loading,
  loginAttemptId,
  onResendCode,
  resendSecondsLeft,
  setCode,
  setLoginAttemptId,
  setStep,
  setTurnstileToken,
  step,
  submitCode,
  submitting,
  turnstileReset,
  turnstileToken,
  onLoginSuccess,
}: LoginCodePanelProps) {
  function handleBack() {
    setStep('email')
    setCode('')
    turnstileReset()
    setTurnstileToken(null)
  }

  function handleCodeChange(value: string) {
    const upper = value.toUpperCase()
    setCode(upper)
  }

  async function handleCodeSubmit(e: SyntheticEvent) {
    e.preventDefault()
    if (submitting.current) return
    await submitCode(code)
  }

  function handleMfaBack() {
    setStep('email')
    setLoginAttemptId('')
  }

  return (
    <div
      className='contents'
      data-pw='login-code-panel'
    >
      <LoginCodeStep
        active={active}
        code={code}
        email={email}
        loading={loading}
        onBack={handleBack}
        onCodeChange={handleCodeChange}
        onResendCode={onResendCode}
        resendSecondsLeft={resendSecondsLeft}
        onSubmit={handleCodeSubmit}
        turnstileReady={turnstileToken !== null}
      />
      {step === 'mfa' && (
        <MfaStep
          loginAttemptId={loginAttemptId}
          onSuccess={onLoginSuccess}
          onBack={handleMfaBack}
        />
      )}
    </div>
  )
}
