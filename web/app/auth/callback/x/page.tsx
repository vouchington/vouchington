'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/use-translations'

const X_CALLBACK_FALLBACK = <XCallbackStatus />

export default function XCallbackPage() {
  return (
    <Suspense fallback={X_CALLBACK_FALLBACK}>
      <XCallbackContent />
    </Suspense>
  )
}

function XCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (window.opener) {
      window.opener.postMessage({ provider: 'x', code, state, error }, window.location.origin)
      window.close()
    }
  }, [searchParams])

  return <XCallbackStatus />
}

function XCallbackStatus() {
  const t = useTranslations()
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <h1 className='sr-only'>{t('extracted.x.page.completingXSignIn_cba21950')}</h1>
      <p
        data-pw='oauth-callback-x-loading'
        className='text-muted-foreground text-sm'
      >
        {t('extracted.x.page.completingSignIn_f0e27215')}
      </p>
    </div>
  )
}
