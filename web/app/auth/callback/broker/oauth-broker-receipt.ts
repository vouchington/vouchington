const RECEIPT_CHECK_INTERVAL_MS = 250
const RECEIPT_TIMEOUT_MS = 10_000

type OAuthBrokerReceiptMessage = {
  type?: string
  flowId?: string
}

export function waitForOAuthBrokerReceipt(
  opener: Window,
  flowId: string,
): { result: Promise<boolean>; cancel: () => void } {
  let cancel: () => void = () => {}
  const result = new Promise<boolean>(resolve => {
    let settled = false
    const timeout = window.setTimeout(() => finish(false), RECEIPT_TIMEOUT_MS)
    const openerCheck = window.setInterval(() => {
      if (opener.closed) finish(false)
    }, RECEIPT_CHECK_INTERVAL_MS)
    window.addEventListener('message', handleMessage)

    function finish(received: boolean) {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      window.clearInterval(openerCheck)
      window.removeEventListener('message', handleMessage)
      resolve(received)
    }

    cancel = () => finish(false)

    function handleMessage(event: MessageEvent<OAuthBrokerReceiptMessage>) {
      if (event.origin !== window.location.origin || event.source !== opener) return
      if (event.data?.type !== 'voucha:oauth-broker:received' || event.data.flowId !== flowId) {
        return
      }
      finish(true)
    }
  })
  return { result, cancel }
}
