/* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
'use client'

import { useRef, useEffect, type RefObject, type FormEvent } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'
import type { OAuthProvider } from '@/types/user'
import { OAuthLoginButton } from './oauth-login-button'
import { LoginTurnstileSlot } from './login-turnstile-slot'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { OAuthProvidersResponse } from '@/lib/api/client'

interface LoginEmailStepProps {
  active: boolean
  email: string
  hasOAuthProviders: boolean
  hpPhoneRef: RefObject<HTMLInputElement | null>
  hpWebsiteRef: RefObject<HTMLInputElement | null>
  loading: boolean
  oauthProviders: OAuthProvider[]
  oauthBrokerCapabilities?: OAuthProvidersResponse['broker_capabilities']
  oauthReturnTo?: string
  onEmailChange: (value: string) => void
  onOAuthToken: (token: OAuthLoginToken) => Promise<void>
  onPasskeySignIn: () => Promise<void>
  onSubmit: (e: FormEvent) => Promise<void>
  turnstileRef: (node: HTMLDivElement | null) => void
  turnstileToken: string | null
  turnstileAlwaysApprove?: boolean
}
const EMPTY_BROKER_CAPABILITIES: OAuthProvidersResponse['broker_capabilities'] = {}
export function LoginEmailStep({
  active,
  email,
  hasOAuthProviders,
  hpPhoneRef,
  hpWebsiteRef,
  loading,
  oauthProviders,
  oauthBrokerCapabilities = EMPTY_BROKER_CAPABILITIES,
  oauthReturnTo = '/',
  onEmailChange,
  onOAuthToken,
  onPasskeySignIn,
  onSubmit,
  turnstileRef,
  turnstileToken,
  turnstileAlwaysApprove = false,
}: LoginEmailStepProps) {
  const t = useTranslations()
  const emailInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (active) emailInputRef.current?.focus()
  }, [active])

  return (
    <div className={active ? 'space-y-4' : 'hidden'}>
      {hasOAuthProviders && (
        <>
          <div className='flex flex-col gap-2'>
            {oauthProviders.map(provider => (
              <OAuthLoginButton
                key={provider}
                provider={provider}
                onToken={onOAuthToken}
                disabled={loading}
                broker={
                  (provider === 'facebook' || provider === 'x' || provider === 'github') &&
                  oauthBrokerCapabilities[provider]?.modes.web
                    ? { purpose: 'authenticate', returnTo: oauthReturnTo }
                    : undefined
                }
              />
            ))}
          </div>

          <div className='relative'>
            <div className='absolute inset-0 flex items-center'>
              <span className='w-full border-t' />
            </div>
            <div className='relative flex justify-center text-xs uppercase'>
              <span className='bg-background px-2 text-muted-foreground'>
                {t('extracted.auth.loginEmailStep.or_7175517a')}
              </span>
            </div>
          </div>
        </>
      )}

      <form
        onSubmit={onSubmit}
        className='space-y-4'
      >
        <div
          aria-hidden='true'
          style={{
            position: 'absolute',
            left: '-9999px',
            opacity: 0,
            visibility: 'hidden',
          }}
        >
          <Input
            ref={hpWebsiteRef}
            name='hp_website'
            type='text'
            tabIndex={-1}
            autoComplete='off'
            defaultValue=''
          />
          <Input
            ref={hpPhoneRef}
            name='hp_phone'
            type='text'
            tabIndex={-1}
            autoComplete='off'
            defaultValue=''
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='email'>{t('extracted.auth.loginEmailStep.email_969ccbd3')}</Label>
          <Input
            ref={emailInputRef}
            id='email'
            name='email'
            type='email'
            placeholder={t('extracted.auth.loginEmailStep.youExampleCom_53e6cdc3')}
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            autoComplete='email'
            inputMode='email'
            spellCheck={false}
            autoCapitalize='none'
            required
            data-pw='login-email-input'
          />
        </div>
        {turnstileAlwaysApprove ? null : <LoginTurnstileSlot turnstileRef={turnstileRef} />}
        <p className='text-xs text-muted-foreground'>
          {t('extracted.auth.loginEmailStep.newHereEnterYourEmailAnd_bd8a88bd')}
        </p>
        <Button
          type='submit'
          className='h-11 w-full'
          loading={loading}
          disabled={loading || !turnstileToken}
          data-pw='login-continue-with-email-button'
        >
          {loading
            ? t('extracted.auth.loginEmailStep.sending_286a3af7')
            : t('extracted.auth.loginEmailStep.continueWithEmail_8c99a086')}
        </Button>
      </form>

      <div className='relative'>
        <div className='absolute inset-0 flex items-center'>
          <span className='w-full border-t' />
        </div>
        <div className='relative flex justify-center text-xs uppercase'>
          <span className='bg-background px-2 text-muted-foreground'>
            {t('extracted.auth.loginEmailStep.or_7175517a')}
          </span>
        </div>
      </div>

      <Button
        type='button'
        variant='outline'
        className='h-11 w-full'
        onClick={onPasskeySignIn}
        disabled={loading}
        data-pw='login-passkey-button'
      >
        {t('extracted.auth.loginEmailStep.signInWithAPasskey_b09700bc')}
      </Button>
      <p className='text-center text-xs text-muted-foreground'>
        {t('extracted.auth.loginEmailStep.byContinuingYouAgreeToOur_b5f64aac')}{' '}
        <Link
          href='/article/terms-of-service'
          prefetch={false}
          className='underline underline-offset-2 hover:text-foreground'
        >
          {t('extracted.auth.loginEmailStep.termsOfService_4afa55bf')}
        </Link>{' '}
        {t('extracted.auth.loginEmailStep.and_6201111b')}{' '}
        <Link
          href='/article/privacy-policy'
          prefetch={false}
          className='underline underline-offset-2 hover:text-foreground'
        >
          {t('extracted.auth.loginEmailStep.privacyPolicy_506ff394')}
        </Link>
        {t('extracted.auth.loginEmailStep.text_cdb4ee2a')}
      </p>
    </div>
  )
}
