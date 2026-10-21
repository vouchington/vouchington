import { onTestFinished } from 'vitest'
import { acquirePlatformStatsRefreshReservation } from './platform-stats-refresh-reservation.mts'
import { withOwnedPlatformStatsServer } from './platform-stats-owned-server.mts'
import { enableQueryCapture, stopTestQueryCapture } from './query-capture.mts'

/** A timeout-safe owner: drain all servers and observers before releasing the shared refresh lock. */
export async function createPlatformStatsLifecycle() {
  const servers: (() => Promise<void>)[] = []
  const observers: (() => void)[] = []
  let closing = false
  let reservationReleased = false
  let serversDrained = 0
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
      const failures: unknown[] = []
      for (const drain of servers) {
        try {
          await drain()
          serversDrained++
        } catch (err) {
          failures.push(err)
        }
      }
      for (const cleanup of observers) {
        try {
          cleanup()
        } catch (err) {
          failures.push(err)
        }
      }
      try {
        stopQueries()
      } catch (err) {
        failures.push(err)
      }
      if (reservation) {
        try {
          await (await reservation).release()
          reservationReleased = true
        } catch (err) {
          failures.push(err)
        }
      }
      if (failures.length)
        throw new AggregateError(failures, 'Stats lifecycle cleanup failed', { cause: failures[0] })
    })()
    return closeTask
  }
  // The registration precedes even refresh-lock acquisition; a late acquisition is drained too.
  onTestFinished(close)
  reservation = acquirePlatformStatsRefreshReservation()
  await reservation
  if (closing) {
    await close()
    throw new Error('Stats lifecycle closed during reservation acquisition')
  }
  return {
    close,
    observations: () => ({
      closing,
      reservationReleased,
      servers: servers.length,
      serversDrained,
      queryCaptureActive: captured,
    }),
    captureQueries() {
      if (closing || captured) throw new Error('Stats query capture cannot start')
      enableQueryCapture()
      captured = true
    },
    stopQueries,
    cleanupAfterDrain(cleanup: () => void) {
      if (closing) throw new Error('Stats lifecycle is closing')
      observers.push(cleanup)
    },
    withServer<Result>(
      run: Parameters<typeof withOwnedPlatformStatsServer<Result>>[0],
      holdWrite = false,
    ) {
      if (closing) throw new Error('Stats lifecycle is closing')
      return withOwnedPlatformStatsServer(run, holdWrite, drain => servers.push(drain))
    },
  }
}
