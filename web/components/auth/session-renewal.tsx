'use client'

import { useEffect, useState } from 'react'
import { ApiError } from '@vouchington/api-client'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { isDefinitiveRenewalFailure, renewBrowserSession } from '@/lib/api/client/session-renewal'
import { buildLoginHref } from '@/lib/auth/login-url'
import { useTranslations } from '@/lib/i18n/use-translations'

function navigateTo(href: string): void {
  window.location.replace(href)
}

export function SessionRenewal({
  next,
  renewSession = renewBrowserSession,
  navigate = navigateTo,
}: {
  next: string
  renewSession?: typeof renewBrowserSession
  navigate?: (href: string) => void
}) {
  const t = useTranslations()
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    async function renew() {
      try {
        const authenticated = await renewSession()
        if (active) navigate(authenticated ? next : buildLoginHref({ next }))
      } catch (err) {
        if (!active) return
        if (isDefinitiveRenewalFailure(err)) navigate(buildLoginHref({ next }))
        else if (
          err instanceof ApiError &&
          err.status === 403 &&
          err.code === 'DBSC_PROOF_REQUIRED'
        )
          // In-scope dashboard navigation lets the browser perform its registered-key refresh.
          navigate(next)
        else setFailed(true)
      }
    }
    void renew()
    return () => {
      active = false
    }
  }, [attempt, navigate, next, renewSession])

  if (failed)
    return (
      <div className='flex min-h-screen flex-col items-center justify-center gap-4'>
        <p role='alert'>{t('extracted.api.errorHelpers.anErrorOccurredPleaseTryAgain_9c170dda')}</p>
        <Button
          onClick={() => {
            setFailed(false)
            setAttempt(value => value + 1)
          }}
        >
          {t('extracted.app.error.tryAgain_d8b8392e')}
        </Button>
      </div>
    )

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <Spinner />
    </div>
  )
}
