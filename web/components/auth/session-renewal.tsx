'use client'

import { useEffect } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { renewBrowserSession } from '@/lib/api/client/session-renewal'
import { buildLoginHref } from '@/lib/auth/login-url'

export function SessionRenewal({ next }: { next: string }) {
  useEffect(() => {
    let active = true
    async function renew() {
      try {
        await renewBrowserSession()
        if (active) window.location.replace(next)
      } catch {
        if (active) window.location.replace(buildLoginHref({ next }))
      }
    }
    void renew()
    return () => {
      active = false
    }
  }, [next])

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <Spinner />
    </div>
  )
}
