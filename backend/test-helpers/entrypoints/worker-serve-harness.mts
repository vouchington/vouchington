import type { registerWorkerServe } from '@backend/worker-runtime/serve-runtime'

export type RegisterWorkerServe = typeof registerWorkerServe
export type ShutdownCallback = () => void | Promise<void>
type ProcessHandler = (...args: unknown[]) => void

export function makeWorker(close: () => Promise<void> = async () => {}) {
  return { close }
}

function makeTimeoutMock(): typeof globalThis.setTimeout {
  const timeout = {} as NodeJS.Timeout
  return (() => timeout) as typeof globalThis.setTimeout
}

const silentConsole = { log: () => {}, error: () => {} }

export function bootWorkerServe(
  registerWorkerServe: RegisterWorkerServe,
  options: {
    workers?: ReturnType<typeof makeWorker>[]
    onError?: (error: Error) => void
    flushSentry?: () => Promise<void>
    createServer?: () => { listen: () => void }
    env?: NodeJS.ProcessEnv
    exits?: number[]
    shutdownCallbacks?: ShutdownCallback[]
  } = {},
) {
  const processHandlers = new Map<string, ProcessHandler>()
  const process = {
    env: options.env ?? {},
    on: (event: string, handler: ProcessHandler) => {
      processHandlers.set(event, handler)
      return undefined as never
    },
    exit: (code?: number) => {
      options.exits?.push(code ?? 0)
      return undefined as never
    },
  }
  const returned = registerWorkerServe({
    workers: options.workers ?? [makeWorker()],
    addGracefulShutdownCallback: callback => {
      options.shutdownCallbacks?.push(callback)
      return 1
    },
    onError: options.onError ?? (() => {}),
    flushSentry: options.flushSentry ?? (async () => {}),
    createServer: (options.createServer ?? (() => ({ listen: () => {} }))) as never,
    process,
    console: silentConsole,
    setTimeout: makeTimeoutMock(),
  })
  return { processHandlers, returned }
}
