import { fetch } from 'undici'
import { createHttpDispatchers } from '@vouchington/http-transport/dispatchers'

// ECS gives its probe five seconds. Finish the local HTTP request before that deadline,
// without booting the application or contacting its database, queues, or external services.
export async function checkLocalHealth(port: number): Promise<boolean> {
  try {
    // Own the short-lived probe's transport without loading application error reporting.
    await using dispatchers = createHttpDispatchers({ onError: console.error })
    const { getExternalRequestDispatcher } = dispatchers
    const response = await fetch(`http://127.0.0.1:${port}/infra/ping`, {
      dispatcher: getExternalRequestDispatcher(),
      signal: AbortSignal.timeout(4_000),
    })
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}
