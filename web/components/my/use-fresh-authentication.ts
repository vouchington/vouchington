'use client'

import { useEffect, useRef, useState } from 'react'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getMfaStatusClient } from '@/lib/api/client'
import type { MfaStatus } from '@/types/user'

export function useFreshAuthentication(initialStatus?: MfaStatus) {
  const t = useTranslations()
  const [requestId, setRequestId] = useState<number | null>(null)
  const [status, setStatus] = useState<MfaStatus>(
    initialStatus ?? { has_mfa: false, passkeys_count: 0, totp_count: 0 },
  )
  const nextRequestId = useRef(0)
  const mounted = useRef(false)
  const pending = useRef<{
    id: number
    resolve: (token: string | null) => void
  } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pending.current?.resolve(null)
      pending.current = null
    }
  }, [])

  async function requestAuthentication(): Promise<string | null> {
    if (!mounted.current) return null
    if (!initialStatus) {
      try {
        const currentStatus = await getMfaStatusClient<MfaStatus>()
        if (!mounted.current) return null
        setStatus(currentStatus)
      } catch (err) {
        if (mounted.current)
          onError(err, {
            fallback: t('extracted.my.totpManager.failedToVerifyCode_eff1b93c'),
            tags: { form: 'account-reauth' },
          })
        return null
      }
    }
    pending.current?.resolve(null)
    return new Promise(resolve => {
      const id = ++nextRequestId.current
      pending.current = { id, resolve }
      setRequestId(id)
    })
  }

  function close() {
    if (!pending.current || pending.current.id !== requestId) return
    pending.current.resolve(null)
    pending.current = null
    setRequestId(null)
  }

  function verified(token: string) {
    if (!pending.current || pending.current.id !== requestId) return
    pending.current.resolve(token)
    pending.current = null
    setRequestId(null)
  }

  return {
    requestAuthentication,
    dialogProps: {
      open: requestId !== null,
      mfaStatus: status,
      onClose: close,
      onVerified: verified,
    },
  }
}
