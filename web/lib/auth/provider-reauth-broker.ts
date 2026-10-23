'use client'

import { beginBrokerProviderReAuth, retrieveBrokerProviderReAuthProof } from '@/lib/api/client'
import { waitForOAuthBrokerPopup, type BrokerOAuthProvider } from './oauth-broker'
import { OAuthCancelledError } from './oauth-error'

export async function startBrokerProviderReAuth(provider: BrokerOAuthProvider): Promise<string> {
  const popup = window.open('', `voucha-reauth-${crypto.randomUUID()}`, 'width=600,height=700')
  if (!popup) throw new OAuthCancelledError(provider, 'Popup blocked')
  let cancel: (() => void) | undefined
  try {
    if (!navigator.locks) throw new OAuthCancelledError(provider, 'Browser unsupported')
    return await navigator.locks.request(
      'voucha-oauth-broker-authorization',
      { mode: 'exclusive', ifAvailable: true },
      async lock => {
        if (!lock) throw new OAuthCancelledError(provider, 'Another authorization is in progress')
        const authorization = await beginBrokerProviderReAuth(provider)
        const pending = waitForOAuthBrokerPopup(
          popup,
          authorization.flow_id,
          authorization.expires_at,
        )
        cancel = pending.cancel
        popup.location.assign(authorization.redirect_url)
        const result = await pending.result
        if (result.status !== 'connected')
          throw new Error('Provider reauthentication did not complete')
        const proof = await retrieveBrokerProviderReAuthProof(provider, authorization.flow_id)
        return proof.re_auth_token
      },
    )
  } finally {
    cancel?.()
    popup.close()
  }
}
