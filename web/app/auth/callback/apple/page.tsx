'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/use-translations'

const APPLE_CALLBACK_FALLBACK = <AppleCallbackStatus />
const APPLE_CALLBACK_PATH = 'voucha://auth/apple/callback'
const APPLE_CALLBACK_PARAM_KEYS = ['id_token', 'state', 'userName', 'error'] as const
const APPLE_CALLBACK_USER_NAME_KEYS = ['userName', 'user_name', 'name'] as const

export default function AppleCallbackPage() {
  return (
    <Suspense fallback={APPLE_CALLBACK_FALLBACK}>
      <AppleCallbackContent />
    </Suspense>
  )
}

function AppleCallbackContent() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const callbackUrl = new URL(APPLE_CALLBACK_PATH)
    const callbackParams = appleCallbackParams(searchParams)

    for (const key of APPLE_CALLBACK_PARAM_KEYS) {
      const value = callbackParams.get(key)
      if (value !== null) callbackUrl.searchParams.set(key, value)
    }

    const userName = readAppleUserName(callbackParams)
    if (userName !== null) callbackUrl.searchParams.set('userName', userName)

    if (window.opener) {
      window.opener.postMessage(
        {
          provider: 'apple',
          id_token: callbackParams.get('id_token'),
          state: callbackParams.get('state'),
          userName,
          error: callbackParams.get('error'),
        },
        window.location.origin,
      )
      window.close()
      return
    }

    window.location.assign(callbackUrl.toString())
  }, [searchParams])

  return <AppleCallbackStatus />
}

function appleCallbackParams(searchParams: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(searchParams)
  const hash = window.location.hash.slice(1)
  const hashParams = new URLSearchParams(hash)

  for (const [key, value] of hashParams.entries()) {
    params.set(key, value)
  }

  return params
}

function readAppleUserName(searchParams: URLSearchParams): string | null {
  for (const key of APPLE_CALLBACK_USER_NAME_KEYS) {
    const value = searchParams.get(key)
    if (value !== null) return value
  }
  return null
}

function AppleCallbackStatus() {
  const t = useTranslations()
  return (
    <div className='flex min-h-screen items-center justify-center'>
      <h1 className='sr-only'>{t('extracted.apple.page.completingAppleSignIn_38994fba')}</h1>
      <p
        data-pw='oauth-callback-apple-loading'
        className='text-muted-foreground text-sm'
      >
        {t('extracted.apple.page.completingSignIn_f0e27215')}
      </p>
    </div>
  )
}
