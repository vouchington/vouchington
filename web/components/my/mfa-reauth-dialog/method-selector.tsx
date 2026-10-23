'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { OAuthProvider } from '@/types/user'
import type { ReauthMethod } from './methods'

const providerNames: Record<OAuthProvider, string> = {
  apple: 'Apple',
  google: 'Google',
  facebook: 'Facebook',
  x: 'X',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  microsoft: 'Microsoft',
}

export function MethodSelector({
  loading,
  method,
  methods,
  setEmailCode,
  setEmailSent,
  setMethod,
  setSentToEmail,
}: {
  loading: boolean
  method: ReauthMethod | undefined
  methods: ReauthMethod[]
  setEmailCode: (code: string) => void
  setEmailSent: (sent: boolean) => void
  setMethod: (method: ReauthMethod) => void
  setSentToEmail: (email: string) => void
}) {
  const t = useTranslations()
  return (
    <div className='flex flex-wrap gap-2'>
      {methods.map(option => (
        <Button
          key={option}
          data-pw={`method-selector-${option === 'totp' ? 'authenticator-app' : option === 'email' ? 'email-verification' : option}`}
          variant={method === option ? 'default' : 'outline'}
          size='sm'
          onClick={() => {
            setMethod(option)
            setEmailSent(false)
            setEmailCode('')
            setSentToEmail('')
          }}
          disabled={loading}
        >
          {option === 'totp'
            ? t('extracted.mfaReauthDialog.methodSelector.authenticatorApp_09a12ace')
            : option === 'email'
              ? t('extracted.mfaReauthDialog.methodSelector.emailVerification_4d225196')
              : option === 'passkey'
                ? t('extracted.my.passkeyManager.passkeys_c87ccdb4')
                : providerNames[option]}
        </Button>
      ))}
    </div>
  )
}
