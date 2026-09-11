const LEASE_RENEWAL_INTERVAL_MS = 10_000

export type AdmissionLeaseKeeper = {
  ensureOwned: () => Promise<boolean>
  stop: () => Promise<void>
}

type AdmissionLeaseKeeperRuntime = {
  schedule: (callback: () => void, intervalMs: number) => NodeJS.Timeout
  cancel: (timer: NodeJS.Timeout) => void
}

const admissionLeaseKeeperRuntime: AdmissionLeaseKeeperRuntime = {
  schedule(callback, intervalMs) {
    const timer = setInterval(callback, intervalMs)
    timer.unref()
    return timer
  },
  cancel(timer) {
    clearInterval(timer)
  },
}

export function startAdmissionLeaseKeeper(
  renew: () => Promise<boolean>,
  runtime: AdmissionLeaseKeeperRuntime = admissionLeaseKeeperRuntime,
): AdmissionLeaseKeeper {
  let stopped = false
  let owned = true
  let renewal: Promise<void> | null = null
  const renewOnce = async () => {
    if (stopped || !owned) return
    if (renewal) {
      await renewal
      return
    }
    renewal = renew()
      .then(result => {
        owned = result
        return undefined
      })
      .catch(() => {
        return undefined
      })
      .finally(() => {
        renewal = null
      })
    await renewal
  }
  const timer = runtime.schedule(() => {
    void renewOnce()
  }, LEASE_RENEWAL_INTERVAL_MS)
  return {
    async ensureOwned() {
      await renewOnce()
      return owned
    },
    async stop() {
      stopped = true
      runtime.cancel(timer)
      await renewal
    },
  }
}
