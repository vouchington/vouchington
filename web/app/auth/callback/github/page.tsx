'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/use-translations'

const GITHUB_CALLBACK_FALLBACK = <GithubCallbackStatus />

export default function GithubCallbackPage() {
  return (
    <Suspense fallback={GITHUB_CALLBACK_FALLBACK}>
      <GithubCallbackContent />
    </Suspense>
  )
}

function GithubCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (window.opener) {
      window.opener.postMessage({ provider: 'github', code, state, error }, window.location.origin)
      window.close()
    }
  }, [searchParams])

  return <GithubCallbackStatus />
}

function GithubCallbackStatus() {
  const t = useTranslations()
  return (
    <div
      className='flex min-h-screen items-center justify-center'
      data-pw='oauth-callback-github-loading'
    >
      <h1 className='sr-only'>{t('extracted.github.page.completingGithubSignIn_9876a14b')}</h1>
      <p className='text-muted-foreground text-sm'>
        {t('extracted.github.page.completingSignIn_f0e27215')}
      </p>
    </div>
  )
}
