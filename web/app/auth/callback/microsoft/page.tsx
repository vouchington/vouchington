'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/use-translations'

const MICROSOFT_CALLBACK_FALLBACK = <MicrosoftCallbackStatus />

export default function MicrosoftCallbackPage() {
  return (
    <Suspense fallback={MICROSOFT_CALLBACK_FALLBACK}>
      <MicrosoftCallbackContent />
    </Suspense>
  )
}

function MicrosoftCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (window.opener) {
      window.opener.postMessage(
        { provider: 'microsoft', code, state, error },
        window.location.origin,
      )
      window.close()
    }
  }, [searchParams])

  return <MicrosoftCallbackStatus />
}

function MicrosoftCallbackStatus() {
  const t = useTranslations()
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <h1 className='sr-only'>
        {t('extracted.microsoft.page.completingMicrosoftSignIn_c25bc600')}
      </h1>
      <p
        data-pw='oauth-callback-microsoft-loading'
        className='text-muted-foreground text-sm'
      >
        {t('extracted.microsoft.page.completingSignIn_f0e27215')}
      </p>
    </div>
  )
}
