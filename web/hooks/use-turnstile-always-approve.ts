'use client'

import { useEffect, useState } from 'react'
import { fetchCaptchaConfig } from '@/lib/api/client/captcha-config'

export const TURNSTILE_ALWAYS_APPROVE_TOKEN = 'turnstile-always-approve'

export function useTurnstileAlwaysApprove(): boolean {
  const [alwaysApprove, setAlwaysApprove] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchCaptchaConfig()
      .then(config => {
        if (!cancelled && config.always_approve) setAlwaysApprove(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return alwaysApprove
}
