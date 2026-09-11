'use client'

import { useRef, useState, type SyntheticEvent } from 'react'
import { continueOAuthLogin, sendEmailLoginToken } from '@/lib/api/client'
import onError, { onSuccess } from '@/lib/on-error'
import { tokenToBody } from '@/lib/auth/oauth-token-body'
import { usePasskeySignIn } from './use-passkey-sign-in'
import { useLoginTurnstile } from '@/hooks/use-login-turnstile'
import { LoginCodePanel } from './login-code-panel'
import { LoginEmailStep } from './login-email-step'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'
import { useLoginCodeActions } from './use-login-code-actions'
import { useLoginCodeAutoSubmit } from './use-login-code-auto-submit'
import { sanitizeLoginNext } from '@/lib/auth/login-url'
import { useRouter } from 'next/navigation'
import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'
import { getOAuthProviders } from '@/lib/runtime-public-config'
import { useConfiguredOAuthProviders } from './use-configured-oauth-providers'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'

type Step = 'email' | 'code' | 'mfa'
interface LoginFormProps {
  initialEmailAddress?: string
  initialOtp?: string
  onLoginSuccess?: () => void
  redirectTo?: string
  initialLoginAttemptId?: string
}
export function LoginForm({
  initialEmailAddress = '',
  initialOtp = '',
  onLoginSuccess,
  redirectTo = '/',
  initialLoginAttemptId = '',
}: LoginFormProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const runtimePublicConfig = useRuntimePublicConfig()
  const runtimePublicProviders = getOAuthProviders(runtimePublicConfig)
  const { providers, brokerCapabilities } = useConfiguredOAuthProviders(runtimePublicProviders)
  const { replace, refresh } = useRouter()
  const safeRedirectTo = sanitizeLoginNext(redirectTo)
  const handleLoginSuccess =
    onLoginSuccess ??
    (() => {
      replace(safeRedirectTo)
      refresh()
    })
  const prefilledEmailAddress = initialEmailAddress.trim()
  const prefilledOtp = initialOtp.trim().toUpperCase().slice(0, 8)
  const startsOnCodeStep = prefilledEmailAddress.length > 0 && prefilledOtp.length === 8
  const [step, setStep] = useState<Step>(
    initialLoginAttemptId ? 'mfa' : startsOnCodeStep ? 'code' : 'email',
  )
  const [email, setEmail] = useState(prefilledEmailAddress)
  const [code, setCode] = useState(prefilledOtp)
  const [loginAttemptId, setLoginAttemptId] = useState(initialLoginAttemptId)
  const [loading, setLoading] = useState(false)
  const hpWebsiteRef = useRef<HTMLInputElement>(null)
  const hpPhoneRef = useRef<HTMLInputElement>(null)
  const [capturedHpWebsite, setCapturedHpWebsite] = useState('')
  const [capturedHpPhone, setCapturedHpPhone] = useState('')
  const turnstile = useLoginTurnstile(runtimePublicConfig)
  const { handleResendCode, submitCode, submitting } = useLoginCodeActions({
    capturedHpPhone,
    capturedHpWebsite,
    email,
    handleLoginSuccess,
    handleTurnstileReset: turnstile.reset,
    setLoginAttemptId,
    setLoading,
    setStep,
    turnstileToken: turnstile.token,
    uiLocale,
  })

  async function handleOAuthToken(token: OAuthLoginToken) {
    setLoading(true)
    let shouldResetLoading = true
    try {
      const body = tokenToBody(token)
      const result = await continueOAuthLogin<{
        mfa_required?: boolean
        login_attempt_id?: string
      }>(token.provider, body)
      if (result.mfa_required && result.login_attempt_id) {
        setLoginAttemptId(result.login_attempt_id)
        setStep('mfa')
        shouldResetLoading = true
        return
      }
      shouldResetLoading = false
      onSuccess(t('extracted.auth.loginForm.signedIn_ca566c89'))
      handleLoginSuccess()
    } catch (error) {
      onError(error, {
        fallback: t('extracted.auth.loginForm.unableToConnectPleaseTryAgain_a2f03233'),
        tags: { form: 'auth-login' },
      })
    } finally {
      if (shouldResetLoading) {
        setLoading(false)
      }
    }
  }

  const { handlePasskeySignIn } = usePasskeySignIn({ handleLoginSuccess, setLoading })

  async function handleEmailSubmit(e: SyntheticEvent) {
    e.preventDefault()
    const hpWebsite = hpWebsiteRef.current?.value ?? ''
    const hpPhone = hpPhoneRef.current?.value ?? ''
    setCapturedHpWebsite(hpWebsite)
    setCapturedHpPhone(hpPhone)
    setLoading(true)
    try {
      await sendEmailLoginToken(
        email,
        turnstile.token ?? undefined,
        {
          hp_website: hpWebsite,
          hp_phone: hpPhone,
        },
        uiLocale,
      )
      onSuccess(t('extracted.auth.loginForm.signInCodeSent_9a34e846'))
      setStep('code')
      turnstile.reset()
    } catch (error) {
      onError(error, {
        fallback: t('extracted.auth.loginForm.failedToSendVerificationCode_6401f8f4'),
        tags: { form: 'auth-login' },
      })
    } finally {
      setLoading(false)
    }
  }

  useLoginCodeAutoSubmit({
    code,
    email,
    loading,
    startsOnCodeStep,
    step,
    submitCode,
    submitting,
  })

  return (
    <div className='space-y-4'>
      <LoginEmailStep
        active={step === 'email'}
        email={email}
        hasOAuthProviders={providers.length > 0}
        hpPhoneRef={hpPhoneRef}
        hpWebsiteRef={hpWebsiteRef}
        loading={loading}
        oauthProviders={providers}
        oauthBrokerCapabilities={brokerCapabilities}
        oauthReturnTo={safeRedirectTo}
        onOAuthToken={handleOAuthToken}
        onEmailChange={setEmail}
        onPasskeySignIn={handlePasskeySignIn}
        onSubmit={handleEmailSubmit}
        turnstileRef={turnstile.ref}
        turnstileToken={turnstile.token}
        turnstileAlwaysApprove={turnstile.alwaysApprove}
      />
      <LoginCodePanel
        active={step === 'code'}
        code={code}
        email={email}
        loading={loading}
        loginAttemptId={loginAttemptId}
        onResendCode={handleResendCode}
        setCode={setCode}
        setLoginAttemptId={setLoginAttemptId}
        setStep={setStep}
        setTurnstileToken={token => {
          if (token === null) turnstile.reset()
        }}
        step={step}
        submitCode={submitCode}
        submitting={submitting}
        turnstileReset={turnstile.reset}
        turnstileToken={turnstile.token}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}
