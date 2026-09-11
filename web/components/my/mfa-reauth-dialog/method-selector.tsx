'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export type ReauthMethod = 'totp' | 'email'

interface MethodSelectorProps {
  loading: boolean
  method: ReauthMethod
  setEmailCode: (code: string) => void
  setEmailSent: (sent: boolean) => void
  setMethod: (method: ReauthMethod) => void
  setSentToEmail: (email: string) => void
}

export function MethodSelector({
  loading,
  method,
  setEmailCode,
  setEmailSent,
  setMethod,
  setSentToEmail,
}: MethodSelectorProps) {
  const t = useTranslations()
  return (
    <div className='flex gap-2'>
      <Button
        variant={method === 'totp' ? 'default' : 'outline'}
        size='sm'
        onClick={() => setMethod('totp')}
        disabled={loading}
      >
        {t('extracted.mfaReauthDialog.methodSelector.authenticatorApp_09a12ace')}
      </Button>
      <Button
        variant={method === 'email' ? 'default' : 'outline'}
        size='sm'
        onClick={() => {
          setMethod('email')
          setEmailSent(false)
          setEmailCode('')
          setSentToEmail('')
        }}
        disabled={loading}
      >
        {t('extracted.mfaReauthDialog.methodSelector.emailVerification_4d225196')}
      </Button>
    </div>
  )
}
