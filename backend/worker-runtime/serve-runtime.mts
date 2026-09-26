import type http from 'node:http'
import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import onError, { flushSentry } from '@modules/on-error'

type Worker = {
  close: () => Promise<unknown>
}

type WorkerServeDependencies = {
  workers: readonly Worker[]
  addGracefulShutdownCallback: typeof addGracefulShutdownCallback
  onError: typeof onError
  flushSentry: typeof flushSentry
  createServer: typeof http.createServer
  process: Pick<NodeJS.Process, 'on' | 'env' | 'exit'>
  console: Pick<Console, 'log' | 'error'>
  setTimeout: typeof globalThis.setTimeout
}

export function registerWorkerServe(dependencies: WorkerServeDependencies): readonly Worker[] {
  dependencies.process.on('uncaughtException', (err: unknown) => {
    dependencies.onError(err instanceof Error ? err : new Error(String(err)))
    const exit = () => dependencies.process.exit(1)
    // `.then(exit, exit)` (two-arg form) is kept deliberately rather than "fixed" to
    // `.then(exit).catch(exit)`: the chained form adds a second link, which adds a microtask tick
    // before `exit` fires on rejection. That delay is observable in this uncaughtException/fatal-
    // crash path (proven empirically: it broke
    // backend/test-helpers/entrypoints/worker-serve-cases.mts's "exits nonzero when Sentry
    // flush rejects" assertions). Both branches call the same `exit` function, so
    // fulfillment/rejection semantics are otherwise identical. promise/no-promise-in-callback
    // flags the same line because it calls a promise-returning function from inside a
    // `process.on('uncaughtException', ...)` event-handler callback, which cannot itself be
    // async — the emitter never awaits it.
    // oxlint-disable-next-line promise/prefer-catch, promise/catch-or-return, promise/no-promise-in-callback
    dependencies.flushSentry(2000).then(exit, exit)
    dependencies.setTimeout(exit, 2100)
  })
  dependencies.process.on('unhandledRejection', (reason: unknown) => {
    dependencies.onError(reason instanceof Error ? reason : new Error(String(reason)))
  })

  const prewarmPort =
    dependencies.process.env.NODE_PREWARM && dependencies.process.env.NODE_PREWARM_PORT
      ? Number(dependencies.process.env.NODE_PREWARM_PORT)
      : undefined
  const prewarmServer =
    prewarmPort === undefined ? undefined : dependencies.createServer((_, res) => res.end())
  prewarmServer?.listen(prewarmPort!)

  dependencies.console.log('Workers: workers loaded.')

  dependencies.addGracefulShutdownCallback(async () => {
    if (prewarmServer) {
      prewarmServer.closeAllConnections()
      await new Promise<void>(resolve => prewarmServer.close(() => resolve()))
    }

    dependencies.console.log('Workers: shutting down workers...')
    const results = await Promise.allSettled(dependencies.workers.map(worker => worker.close()))
    for (const result of results) {
      if (result.status === 'rejected') dependencies.console.error(result.reason)
    }
    dependencies.console.log('Workers: workers closed gracefully.')
  })

  return dependencies.workers
}
