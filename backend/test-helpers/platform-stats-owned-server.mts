import { onTestFinished } from 'vitest'
import http from 'node:http'
import { listenOnLoopbackEphemeralPort } from 'vouchington-tooling/runner-port-policy'
import app, { createApiRequestGuardedListener } from '../api/app.mts'
import '../api/index.mts'
import { profileRequestQueries } from './api/request-query-profile.mts'
import { observePlatformStatsCache } from './platform-stats-cache-lifecycle.mts'

type StatsAddress = Awaited<ReturnType<typeof listenOnLoopbackEphemeralPort>>
type TrackWork = <Result>(run: () => Promise<Result>) => Promise<Result>

/** Own actual Stats responses, SDK handlers, and conditional cache commands. */
export async function withOwnedPlatformStatsServer<Result>(
  run: (address: StatsAddress, trackWork: TrackWork) => Promise<Result>,
  registerCleanup: (cleanup: () => Promise<void>) => void,
): Promise<Result> {
  const settle = (task: Promise<unknown>) =>
    task.then(
      value => ({ status: 'fulfilled' as const, value }),
      err => ({ status: 'rejected' as const, reason: err }),
    )
  const responses: Promise<PromiseSettledResult<unknown>>[] = []
  const handlers: Promise<PromiseSettledResult<unknown>>[] = []
  const ownedWork: Promise<PromiseSettledResult<unknown>>[] = []
  const cleanupErrors: unknown[] = []
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
    try {
      handlers.push(settle(profileRequestQueries(req, res, () => listener(req, res))))
    } catch (err) {
      handlers.push(Promise.resolve({ status: 'rejected' as const, reason: err }))
      res.destroy(err instanceof Error ? err : new Error(String(err)))
    }
  })
  server.on('error', err => cleanupErrors.push(err))
  const trackWork: TrackWork = runWork => {
    if (!accepting) return Promise.reject(new Error('Stats server is closing'))
    const task = Promise.resolve().then(runWork)
    ownedWork.push(settle(task))
    return task
  }
  let cache: ReturnType<typeof observePlatformStatsCache> | undefined
  let startup: Promise<StatsAddress | undefined> | undefined
  let cleanupTask: Promise<void> | undefined
  const closeAndDrain = () => {
    cleanupTask ??= (async () => {
      accepting = false
      if (startup) {
        try {
          await startup
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
      const closed = server.listening
        ? settle(
            new Promise<void>((resolve, reject) =>
              server.close(err => (err ? reject(err) : resolve())),
            ),
          )
        : Promise.resolve({ status: 'fulfilled' as const })
      // A response can close before its handler settles and admits a cache write.
      for (const outcome of await Promise.all([...responses, ...handlers, ...ownedWork]))
        if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      if (cache) {
        try {
          await cache.drain()
        } catch (err) {
          cleanupErrors.push(err)
        }
        try {
          await cache.clear()
        } catch (err) {
          cleanupErrors.push(err)
        }
        try {
          cache.restore()
        } catch (err) {
          cleanupErrors.push(err)
        }
      }
      const outcome = await closed
      if (outcome.status === 'rejected') cleanupErrors.push(outcome.reason)
      if (cleanupErrors.length)
        throw new AggregateError(cleanupErrors, 'Stats server cleanup failed', {
          cause: cleanupErrors[0],
        })
    })()
    return cleanupTask
  }
  // Register before cache setup, bind, identity work, or caller admission.
  onTestFinished(closeAndDrain)
  registerCleanup(closeAndDrain)
  const errors: unknown[] = []
  let value: Result | undefined
  try {
    cache = observePlatformStatsCache()
    startup = cache.clear().then(() => {
      if (!accepting) return undefined
      return listenOnLoopbackEphemeralPort(server)
    })
    const address = await startup
    if (!address || !accepting) throw new Error('Stats server closed during startup')
    value = await run(address, trackWork)
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
