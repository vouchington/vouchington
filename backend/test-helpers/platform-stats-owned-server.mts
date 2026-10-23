import { onTestFinished } from 'vitest'
import http from 'node:http'
import { getCapturedQueries } from '@data-stores/psql'
import { listenOnLoopbackEphemeralPort, type LoopbackHost } from '@ts-shared/utils/ephemeral-ports'
import app, { createApiRequestGuardedListener } from '../api/app.mts'
import '../api/index.mts'
import { profileRequestQueries } from './api/request-query-profile.mts'
import { observePlatformStatsCache } from './platform-stats-cache-lifecycle.mts'

type AdmissionReceipt = {
  method: string | undefined
  path: string | undefined
  requestId: string | string[] | undefined
  hasCookie: boolean
  aggregateQueriesAtAdmission: number
}
type StatsLifecycle = {
  nextAdmission(): Promise<AdmissionReceipt>
  closeAndDrain(): Promise<void>
  trackWork<Result>(run: () => Promise<Result>): Promise<Result>
  observations(): { cleanupStarted: boolean; responsesFinishedAfterCleanup: boolean[] }
}

/** Own Stats HTTP responses and the real conditional cache write on a private listener. */
export async function withOwnedPlatformStatsServer<Result>(
  run: (
    address: { host: LoopbackHost; port: number },
    cache: ReturnType<typeof observePlatformStatsCache>,
    lifecycle: StatsLifecycle,
  ) => Promise<Result>,
  holdWrite: boolean,
  registerCleanup: (cleanup: () => Promise<void>) => void,
): Promise<Result> {
  const settle = (task: Promise<unknown>) =>
    task.then(
      value => ({ status: 'fulfilled' as const, value }),
      err => ({ status: 'rejected' as const, reason: err }),
    )
  const responses: Promise<PromiseSettledResult<unknown>>[] = []
  const ownedWork: Promise<PromiseSettledResult<unknown>>[] = []
  const receipt = Promise.withResolvers<AdmissionReceipt>()
  void receipt.promise.catch(() => undefined)
  const responsesFinishedAfterCleanup: boolean[] = []
  let cleanupStarted = false
  let accepting = true
  const listener = createApiRequestGuardedListener(app.callback())
  const server = http.createServer((req, res) => {
    if (!accepting) {
      res.writeHead(503)
      res.end()
      return
    }
    const completed = new Promise<void>((resolve, reject) => {
      const finish = () => {
        detach()
        responsesFinishedAfterCleanup.push(cleanupStarted)
        resolve()
      }
      const close = () => {
        detach()
        if (res.writableFinished) resolve()
        else reject(new Error('Stats response closed before finishing'))
      }
      const error = (reason: Error) => {
        detach()
        reject(reason)
      }
      function detach() {
        res.off('finish', finish)
        res.off('close', close)
        res.off('error', error)
      }
      res.once('finish', finish)
      res.once('close', close)
      res.once('error', error)
    })
    responses.push(settle(completed))
    receipt.resolve({
      method: req.method,
      path: req.url,
      requestId: req.headers['x-request-id'],
      hasCookie: req.headers.cookie !== undefined,
      aggregateQueriesAtAdmission: getCapturedQueries().filter(query =>
        query.text.includes('/* getPlatformStats */'),
      ).length,
    })
    try {
      profileRequestQueries(req, res, () => listener(req, res))
    } catch (err) {
      res.destroy(err instanceof Error ? err : new Error(String(err)))
    }
  })
  let cache: ReturnType<typeof observePlatformStatsCache> | undefined
  const errors: unknown[] = []
  const cleanupErrors: unknown[] = []
  server.on('error', err => cleanupErrors.push(err))
  let startup:
    | Promise<Awaited<ReturnType<typeof listenOnLoopbackEphemeralPort>> | undefined>
    | undefined
  let cleanupTask: Promise<void> | undefined
  const closeAndDrain = () => {
    cleanupTask ??= (async () => {
      cleanupStarted = true
      accepting = false
      receipt.reject(new Error('Stats server closed before request admission'))
      if (startup) {
        try {
          await startup
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
      const closed = server.listening
        ? new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve())),
          )
        : Promise.resolve()
      const closedOutcome = settle(closed)
      // This route awaits the stats read and JSON pipeline before response finish.
      // Its conditional cache write is detached and joined separately below.
      for (const outcome of await Promise.all(responses))
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      for (const outcome of await Promise.all(ownedWork))
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      if (cache) {
        try {
          await cache.fence()
        } catch (err) {
          cleanupErrors.push(err)
        }
        cache.release()
        try {
          await cache.drain()
        } catch (err) {
          cleanupErrors.push(err)
        }
        try {
          await cache.clear()
          await cache.assertMarkerRemoved()
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
      const outcome = await closedOutcome
      if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      if (cache) {
        try {
          cache.restore()
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
      if (cleanupErrors.length)
        throw new AggregateError(cleanupErrors, 'Stats server cleanup failed', {
          cause: cleanupErrors[0],
        })
    })()
    return cleanupTask
  }
  // Registered before cache setup, bind, identity work, or caller admission.
  onTestFinished(closeAndDrain)
  registerCleanup(closeAndDrain)
  const lifecycle: StatsLifecycle = {
    nextAdmission: () => receipt.promise,
    trackWork(run) {
      if (!accepting) return Promise.reject(new Error('Stats server is closing'))
      const task = Promise.resolve().then(run)
      ownedWork.push(settle(task))
      return task
    },
    closeAndDrain,
    observations: () => ({
      cleanupStarted,
      responsesFinishedAfterCleanup: [...responsesFinishedAfterCleanup],
    }),
  }
  let value: Result | undefined
  try {
    const observedCache = observePlatformStatsCache(holdWrite)
    cache = observedCache
    startup = observedCache.clear().then(() => {
      if (!accepting) return undefined
      return listenOnLoopbackEphemeralPort(server)
    })
    const address = await startup
    if (!address || !accepting) throw new Error('Stats server closed during startup')
    value = await run(address, observedCache, lifecycle)
  } catch (err) {
    errors.push(err)
  } finally {
    try {
      await closeAndDrain()
    } catch (err) {
      errors.push(err)
    }
  }
  if (errors.length)
    throw new AggregateError(errors, 'Owned Stats lifecycle failed', { cause: errors[0] })
  return value as Result
}
