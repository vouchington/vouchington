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
      {methods.map(option => {
        const buttonProps = {
          variant: method === option ? ('default' as const) : ('outline' as const),
          size: 'sm' as const,
          onClick: () => {
            setMethod(option)
            setEmailSent(false)
            setEmailCode('')
            setSentToEmail('')
          },
          disabled: loading,
        }
        switch (option) {
          case 'totp':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-authenticator-app'
              >
                {t('extracted.mfaReauthDialog.methodSelector.authenticatorApp_09a12ace')}
              </Button>
            )
          case 'email':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-email-verification'
              >
                {t('extracted.mfaReauthDialog.methodSelector.emailVerification_4d225196')}
              </Button>
            )
          case 'passkey':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-passkey'
              >
                {t('extracted.my.passkeyManager.passkeys_c87ccdb4')}
              </Button>
            )
          case 'apple':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-apple'
              >
                {providerNames[option]}
              </Button>
            )
          case 'google':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-google'
              >
                {providerNames[option]}
              </Button>
            )
          case 'facebook':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-facebook'
              >
                {providerNames[option]}
              </Button>
            )
          case 'x':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-x'
              >
                {providerNames[option]}
              </Button>
            )
          case 'github':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-github'
              >
                {providerNames[option]}
              </Button>
            )
          case 'linkedin':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-linkedin'
              >
                {providerNames[option]}
              </Button>
            )
          case 'microsoft':
            return (
              <Button
                key={option}
                {...buttonProps}
                data-pw='method-selector-microsoft'
              >
                {providerNames[option]}
              </Button>
            )
          default:
            throw new Error(`Unsupported reauthentication method: ${option}`)
        }
      })}
    </div>
  )
}
