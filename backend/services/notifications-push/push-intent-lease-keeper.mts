import type { NotificationPushIntent } from './push-intents.mts'

type LeaseRenew = (intent: NotificationPushIntent, leaseSeconds: number) => Promise<boolean>

export type NotificationPushIntentLeaseKeeper = {
  readonly ownershipLost: boolean
  readonly fatalError: Error | undefined
  start(): void
  fail(error?: Error): void
  renewNow(): Promise<boolean>
  stopAndSettle(): Promise<void>
}

export function createNotificationPushIntentLeaseKeeper(input: {
  intent: NotificationPushIntent
  leaseSeconds: number
  renewalMs: number
  renew: LeaseRenew
  onLost: () => void
}): NotificationPushIntentLeaseKeeper {
  let stopped = false
  let ownershipLost = false
  let fatalError: Error | undefined
  let timer: NodeJS.Timeout | undefined
  let renewal: Promise<boolean> | undefined

  function fail(error?: Error) {
    if (ownershipLost) return
    ownershipLost = true
    fatalError ??= error
    input.onLost()
  }

  async function renewNow(): Promise<boolean> {
    if (ownershipLost) return false
    if (renewal) return await renewal
    renewal = input
      .renew(input.intent, input.leaseSeconds)
      .then(accepted => {
        if (!accepted) fail()
        return accepted
      })
      .catch(error => {
        const failure =
          error instanceof Error ? error : new Error('Push intent lease renewal failed')
        fail(failure)
        return false
      })
      .finally(() => {
        renewal = undefined
      })
    return await renewal
  }

  function start() {
    timer = setInterval(() => {
      if (!stopped) void renewNow()
    }, input.renewalMs)
    timer.unref()
  }

  async function stopAndSettle() {
    stopped = true
    if (timer) clearInterval(timer)
    await renewal
  }

  return {
    get ownershipLost() {
      return ownershipLost
    },
    get fatalError() {
      return fatalError
    },
    start,
    fail,
    renewNow,
    stopAndSettle,
  }
}
