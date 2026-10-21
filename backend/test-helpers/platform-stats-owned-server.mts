import { onTestFinished } from 'vitest'
import http from 'node:http'
import { createApp, type Handler } from '@jongleberry/api-server'
import { listenOnLoopbackEphemeralPort, type LoopbackHost } from '@ts-shared/utils/ephemeral-ports'
import {
  configureVouchaApiApp,
  createApiRequestGuardedListener,
  VOUCHA_API_SERVER_OPTIONS,
} from '../api/app.mts'
import { installRequestContractEnforcement } from '../api/request-contract-enforcement-helpers.mts'
import { registerPlatformStatsRoute } from '../api/v1/platform-stats/platform-stats.mts'
import onError from '@modules/on-error'
import { profileRequestQueries } from './api/request-query-profile.mts'
import { observePlatformStatsCache } from './platform-stats-cache-lifecycle.mts'

type AdmissionReceipt = {
  method: string | undefined
  path: string | undefined
  requestId: string | string[] | undefined
  hasCookie: boolean
  handlers: number
}
type StatsLifecycle = {
  nextAdmission(): Promise<AdmissionReceipt>
  closeAndDrain(): Promise<void>
  trackWork<Result>(run: () => Promise<Result>): Promise<Result>
  observations(): { cleanupStarted: boolean; handlerStartedAfterCleanup: boolean[] }
}

/** Own HTTP admission, actual identity/GET handler work, and this private project's cache writes. */
export async function withOwnedPlatformStatsServer<Result>(
  run: (
    address: { host: LoopbackHost; port: number },
    cache: ReturnType<typeof observePlatformStatsCache>,
    lifecycle: StatsLifecycle,
  ) => Promise<Result>,
  holdWrite: boolean,
  registerCleanup: (cleanup: () => Promise<void>) => void,
): Promise<Result> {
  const app = createApp(VOUCHA_API_SERVER_OPTIONS)
  const handlers: Promise<PromiseSettledResult<unknown>>[] = []
  const admissions: Promise<PromiseSettledResult<unknown>>[] = []
  const ownedWork: Promise<PromiseSettledResult<unknown>>[] = []
  const settle = (task: Promise<unknown>) =>
    task.then(
      value => ({ status: 'fulfilled' as const, value }),
      err => ({ status: 'rejected' as const, reason: err }),
    )
  let cleanupStarted = false
  const handlerStartedAfterCleanup: boolean[] = []
  const receipt = Promise.withResolvers<AdmissionReceipt>()
  void receipt.promise.catch(() => undefined)
  const route = app.route
  app.route = path => {
    const builder = route.call(app, path)
    const get = builder.get
    builder.get = handler =>
      get.call(builder, (ctx => {
        handlerStartedAfterCleanup.push(cleanupStarted)
        const task = Promise.resolve().then(() => handler(ctx))
        handlers.push(settle(task))
        return task
      }) satisfies Handler)
    return builder
  }
  // Installed after the observer so its complete contract handler is retained.
  installRequestContractEnforcement(app, onError)
  configureVouchaApiApp(app)
  registerPlatformStatsRoute(app)
  const listener = createApiRequestGuardedListener(app.callback())
  let accepting = true
  const server = http.createServer((req, res) => {
    if (!accepting) {
      res.writeHead(503)
      res.end()
      return
    }
    const record = Promise.withResolvers<void>()
    admissions.push(settle(record.promise))
    receipt.resolve({
      method: req.method,
      path: req.url,
      requestId: req.headers['x-request-id'],
      hasCookie: req.headers.cookie !== undefined,
      handlers: handlers.length,
    })
    profileRequestQueries(req, res, () => {
      try {
        void listener(req, res).then(record.resolve, record.reject)
      } catch (err) {
        record.reject(err)
      }
    })
  })
  const cache = observePlatformStatsCache(holdWrite)
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
      try {
        await cache.fence()
      } catch (err) {
        cleanupErrors.push(err)
      }
      for (const outcome of await Promise.all(admissions))
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      for (const outcome of await Promise.all(ownedWork))
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      for (const outcome of await Promise.all(handlers))
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
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
      const outcome = await closedOutcome
      if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      try {
        cache.restore()
      } catch (err) {
        cleanupErrors.push(err)
      }
      if (cleanupErrors.length)
        throw new AggregateError(cleanupErrors, 'Stats server cleanup failed', {
          cause: cleanupErrors[0],
        })
    })()
    return cleanupTask
  }
  // Registered synchronously, before cache setup, bind, identity work or caller admission.
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
      handlerStartedAfterCleanup: [...handlerStartedAfterCleanup],
    }),
  }
  let value: Result | undefined
  try {
    startup = cache.clear().then(() => {
      if (!accepting) return undefined
      return listenOnLoopbackEphemeralPort(server)
    })
    const address = await startup
    if (!address || !accepting) throw new Error('Stats server closed during startup')
    value = await run(address, cache, lifecycle)
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
