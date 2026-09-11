'use client'

import { beginOAuthAuthorization, type OAuthBrokerPurpose } from '@/lib/api/client'
import type { OAuthProvider } from '@/types/user'
import { OAuthCancelledError } from './oauth-error'

export type BrokerOAuthProvider = Extract<OAuthProvider, 'facebook' | 'x' | 'github'>

type BrokerLockManager = Pick<LockManager, 'request'>

export async function startOAuthBrokerAuthorization(
  options: {
    provider: BrokerOAuthProvider
    purpose: OAuthBrokerPurpose
    returnTo: string
  },
  runtime: {
    lockManager?: BrokerLockManager
    reloadPage?: () => void
  } = {},
): Promise<void> {
  const popup = window.open(
    '',
    `voucha-oauth-broker-${options.provider}-${crypto.randomUUID()}`,
    'width=600,height=700',
  )
  if (!popup) throw new OAuthCancelledError(options.provider, 'Popup blocked')

  const reloadPage = runtime.reloadPage ?? (() => window.location.reload())
  let cancelPopupWait: (() => void) | undefined
  try {
    const lockManager = runtime.lockManager ?? navigator.locks
    if (!lockManager) throw new OAuthCancelledError(options.provider, 'Browser unsupported')
    await lockManager.request(
      'voucha-oauth-broker-authorization',
      { mode: 'exclusive', ifAvailable: true },
      async lock => {
        if (!lock) {
          throw new OAuthCancelledError(options.provider, 'Another authorization is in progress')
        }
        const authorization = await beginOAuthAuthorization(options.provider, options.purpose)
        const popupWait = waitForOAuthBrokerPopup(
          popup,
          authorization.flow_id,
          authorization.expires_at,
        )
        cancelPopupWait = popupWait.cancel
        popup.location.assign(authorization.redirect_url)
        const result = await popupWait.result
        if (result.status === 'mfa_required') {
          const next = sanitizeReturnTo(options.returnTo)
          window.location.assign(
            `/login?next=${encodeURIComponent(next)}&login_attempt_id=${encodeURIComponent(result.loginAttemptId)}`,
          )
          return
        }
        const returnTo = sanitizeReturnTo(options.returnTo)
        if (result.status === 'connected') {
          window.history.replaceState(window.history.state, '', returnTo)
          reloadPage()
          return
        }
        window.location.assign(returnTo)
      },
    )
  } catch (error) {
    cancelPopupWait?.()
    popup.close()
    throw error
  }
}

type OAuthBrokerPopupMessage = {
  type?: string
  flowId?: string
  status?: string
  loginAttemptId?: string
}

type OAuthBrokerReceiptMessage = {
  type: 'voucha:oauth-broker:received'
  flowId: string
}

function waitForOAuthBrokerPopup(
  popup: Window,
  flowId: string,
  expiresAt: string,
): {
  result: Promise<
    { status: 'authenticated' | 'connected' } | { status: 'mfa_required'; loginAttemptId: string }
  >
  cancel: () => void
} {
  let cancel: () => void = () => {}
  const result = new Promise<
    { status: 'authenticated' | 'connected' } | { status: 'mfa_required'; loginAttemptId: string }
  >((resolve, reject) => {
    let settled = false
    window.addEventListener('message', handleMessage)
    const checkClosed = window.setInterval(() => {
      if (popup.closed) finish(() => reject(new OAuthCancelledError('OAuth')))
    }, 500)
    const expirationTimer = window.setTimeout(
      () => finish(() => reject(new OAuthCancelledError('OAuth', 'Authorization expired'))),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    )
    function finish(callback: () => void) {
      if (settled) return
      settled = true
      window.clearInterval(checkClosed)
      window.clearTimeout(expirationTimer)
      window.removeEventListener('message', handleMessage)
      callback()
    }
    cancel = () => finish(() => undefined)

    function handleMessage(event: MessageEvent<OAuthBrokerPopupMessage>) {
      if (event.origin !== window.location.origin || event.source !== popup) return
      const message = event.data
      if (message?.type !== 'voucha:oauth-broker:complete' || message.flowId !== flowId) return
      if (message.status === 'authenticated' || message.status === 'connected') {
        confirmOAuthBrokerReceipt(popup, flowId)
        finish(() => resolve({ status: message.status as 'authenticated' | 'connected' }))
        return
      }
      if (message.status === 'mfa_required' && message.loginAttemptId) {
        confirmOAuthBrokerReceipt(popup, flowId)
        finish(() => resolve({ status: 'mfa_required', loginAttemptId: message.loginAttemptId! }))
        return
      }
      finish(() => reject(new Error('OAuth authorization did not complete')))
    }
  })
  return { result, cancel }
}

function confirmOAuthBrokerReceipt(popup: Window, flowId: string): void {
  const receipt: OAuthBrokerReceiptMessage = {
    type: 'voucha:oauth-broker:received',
    flowId,
  }
  popup.postMessage(receipt, window.location.origin)
}

function sanitizeReturnTo(returnTo: string): string {
  return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
}
