'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/use-translations'

const LINKEDIN_CALLBACK_FALLBACK = <LinkedInCallbackStatus />

export default function LinkedInCallbackPage() {
  return (
    <Suspense fallback={LINKEDIN_CALLBACK_FALLBACK}>
      <LinkedInCallbackContent />
    </Suspense>
  )
}

function LinkedInCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (window.opener) {
      window.opener.postMessage(
        { provider: 'linkedin', code, state, error },
        window.location.origin,
      )
      window.close()
    }
  }, [searchParams])

  return <LinkedInCallbackStatus />
}

function LinkedInCallbackStatus() {
  const t = useTranslations()
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <h1 className='sr-only'>{t('extracted.linkedin.page.completingLinkedinSignIn_deb68f2f')}</h1>
      <p
        data-pw='oauth-callback-linkedin-loading'
        className='text-muted-foreground text-sm'
      >
        {t('extracted.linkedin.page.completingSignIn_f0e27215')}
      </p>
    </div>
  )
}
