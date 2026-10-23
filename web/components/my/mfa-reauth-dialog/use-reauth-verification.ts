'use client'

import { useEffect, useRef } from 'react'
import onError from '@/lib/on-error'
import { OAuthCancelledError } from '@/lib/auth/oauth-error'
import { useTranslations } from '@/lib/i18n/use-translations'

export function useReAuthVerification({
  onVerified,
  setLoading,
}: {
  onVerified: (token: string) => void
  setLoading: (loading: boolean) => void
}) {
  const t = useTranslations()
  const mounted = useRef(true)
  const busy = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return async (verify: () => Promise<string>) => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    try {
      const token = await verify()
      if (mounted.current) onVerified(token)
    } catch (err) {
      if (
        err instanceof OAuthCancelledError ||
        (err instanceof Error && err.name === 'NotAllowedError')
      )
        return
      if (mounted.current)
        onError(err, {
          fallback: t('extracted.auth.mfaStep.unableToVerifyPleaseTryAgain_b7979b96'),
          tags: { form: 'account-reauth' },
        })
    } finally {
      busy.current = false
      if (mounted.current) setLoading(false)
    }
  }
}
