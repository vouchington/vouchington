export const PUSH_OWNERSHIP_ACTIVATION_TIMEOUT_MS = 5000

export class ServiceWorkerActivationTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the service worker to activate.')
    this.name = 'ServiceWorkerActivationTimeoutError'
  }
}

export async function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  options: { timeoutMs?: number } = {},
): Promise<ServiceWorkerRegistration> {
  const replacement = registration.installing ?? registration.waiting
  if (!replacement) {
    if (registration.active) return registration
    return waitWithOptionalTimeout(navigator.serviceWorker.ready, options.timeoutMs)
  }
  const worker = replacement
  if (worker.state === 'activated') return registration
  await new Promise<void>((resolve, reject) => {
    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(
            () => finish(() => reject(new ServiceWorkerActivationTimeoutError())),
            options.timeoutMs,
          )

    function finish(settle: () => void) {
      worker.removeEventListener('statechange', onStateChange)
      if (timeout !== undefined) clearTimeout(timeout)
      settle()
    }

    function onStateChange() {
      if (worker.state === 'activated') {
        finish(resolve)
      } else if (worker.state === 'redundant') {
        finish(() => reject(new Error('Service worker replacement became redundant.')))
      }
    }
    worker.addEventListener('statechange', onStateChange)
    onStateChange()
  })
  return registration
}

async function waitWithOptionalTimeout(
  registration: Promise<ServiceWorkerRegistration>,
  timeoutMs?: number,
): Promise<ServiceWorkerRegistration> {
  if (timeoutMs === undefined) return registration
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      registration,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new ServiceWorkerActivationTimeoutError()), timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
