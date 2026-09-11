'use client'

import { OAuthCancelledError } from './oauth-error'

interface OpenOAuthPopupOptions {
  authUrl: URL
  popupName: string
  provider: string
  providerLabel: string
  state: string
}

interface PopupMessage {
  provider?: string
  code?: string
  state?: string
}

export async function openOAuthPopup({
  authUrl,
  popupName,
  provider,
  providerLabel,
  state,
}: OpenOAuthPopupOptions): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl.toString(), popupName, 'width=600,height=700')
    if (!popup) {
      reject(new OAuthCancelledError(providerLabel, 'Popup blocked'))
      return
    }

    let settled = false

    window.addEventListener('message', handleMessage)

    const checkClosed = window.setInterval(() => {
      if (popup.closed) {
        finish(() => reject(new OAuthCancelledError(providerLabel)))
      }
    }, 500)

    function finish(callback: () => void) {
      if (settled) return
      settled = true
      window.clearInterval(checkClosed)
      window.removeEventListener('message', handleMessage)
      callback()
    }

    function handleMessage(event: MessageEvent<PopupMessage>) {
      if (event.origin !== window.location.origin) return
      if (event.source !== popup) return
      if (event.data?.provider !== provider) return

      if (event.data.code && event.data.state === state) {
        const { code } = event.data
        finish(() => resolve({ code }))
        return
      }

      finish(() => reject(new OAuthCancelledError(providerLabel)))
    }
  })
}
