import { onTestFinished } from 'vitest'
import { acquirePlatformStatsRefreshReservation } from './platform-stats-refresh-reservation.mts'
import { withOwnedPlatformStatsServer } from './platform-stats-owned-server.mts'
import { enableQueryCapture, stopTestQueryCapture } from './query-capture.mts'

/** Own one Stats listener and its refresh reservation through test timeout cleanup. */
export async function createPlatformStatsLifecycle() {
  let serverDrain: (() => Promise<void>) | undefined
  let observerCleanup: (() => void) | undefined
  let closing = false
  let closeTask: Promise<void> | undefined
  let captured = false
  let queries: ReturnType<typeof stopTestQueryCapture> = []
  let reservation: ReturnType<typeof acquirePlatformStatsRefreshReservation> | undefined
  const stopQueries = () => {
    if (captured) {
      queries = stopTestQueryCapture()
      captured = false
    }
    return queries
  }
  const close = () => {
    closing = true
    closeTask ??= (async () => {
      const errors: unknown[] = []
      if (serverDrain) {
        try {
          await serverDrain()
        } catch (err) {
          errors.push(err)
        }
      }
      try {
        observerCleanup?.()
      } catch (err) {
        errors.push(err)
      }
      try {
        stopQueries()
      } catch (err) {
        errors.push(err)
      }
      if (reservation) {
        try {
          await (await reservation).release()
        } catch (err) {
          errors.push(err)
        }
      }
      if (errors.length)
        throw new AggregateError(errors, 'Stats lifecycle cleanup failed', { cause: errors[0] })
    })()
    return closeTask
  }
  onTestFinished(close)
  reservation = acquirePlatformStatsRefreshReservation()
  await reservation
  if (closing) {
    await close()
    throw new Error('Stats lifecycle closed during reservation acquisition')
  }
  return {
    captureQueries() {
      if (closing || captured) throw new Error('Stats query capture cannot start')
      enableQueryCapture()
      captured = true
    },
    stopQueries,
    cleanupAfterDrain(cleanup: () => void) {
      if (closing || observerCleanup) throw new Error('Stats lifecycle cannot register cleanup')
      observerCleanup = cleanup
    },
    withServer<Result>(run: Parameters<typeof withOwnedPlatformStatsServer<Result>>[0]) {
      if (closing || serverDrain) throw new Error('Stats listener cannot start')
      return withOwnedPlatformStatsServer(run, drain => {
        serverDrain = drain
      })
    },
  }
}
