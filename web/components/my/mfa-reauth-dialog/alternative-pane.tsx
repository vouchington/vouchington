'use client'

import { PasskeyReAuthPane } from './passkey-pane'
import { ProviderReAuthPane } from './provider-pane'
import type { ReauthMethod } from './methods'

export function AlternativeReAuthPane({
  method,
  ...props
}: {
  method: ReauthMethod | undefined
  loading: boolean
  setLoading: (loading: boolean) => void
  onVerified: (token: string) => void
}) {
  if (method === 'passkey') return <PasskeyReAuthPane {...props} />
  if (!method || method === 'email' || method === 'totp') return null
  return (
    <ProviderReAuthPane
      key={method}
      provider={method}
      {...props}
    />
  )
}
