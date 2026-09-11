import { describe, expect, it, vi } from 'vitest'
import type http from 'node:http'
import { exitAfterErrorReporting, startApiServer } from './startup.mts'

type StartupDeps = Parameters<typeof startApiServer>[2]

function makeStartupDeps(overrides: Partial<StartupDeps> = {}): StartupDeps {
  return {
    exitWithFailure: vi.fn<() => void>(),
    flushErrorReporting: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    logError: vi.fn<(error: Error) => void>(),
    logListening: vi.fn<(port: number) => void>(),
    reportError: vi.fn<(error: Error) => void>(),
    ...overrides,
  }
}

function makeServer() {
  let startupErrorHandler: ((error: Error) => void) | undefined
  let listeningHandler: (() => void) | undefined
  const server = {
    once: vi.fn<(event: string, handler: (error: Error) => void) => void>((event, handler) => {
      expect(event).toBe('error')
      startupErrorHandler = handler
    }),
    listen: vi.fn<(port: number, host: string, handler: () => void) => void>(
      (port, host, handler) => {
        expect(port).toBe(4321)
        expect(host).toBe('::')
        listeningHandler = handler
      },
    ),
    off: vi.fn<() => void>(),
  }
  return {
    server: server as unknown as http.Server,
    emitStartupError: (error: Error) => startupErrorHandler?.(error),
    emitListening: () => listeningHandler?.(),
  }
}

describe('startApiServer', () => {
  it.each(['resolve', 'reject'] as const)(
    'exits one microtask after error reporting %ss',
    async outcome => {
      const flush = Promise.withResolvers<void>()
      const exitWithFailure = vi.fn<() => void>()

      exitAfterErrorReporting(() => flush.promise, exitWithFailure)
      expect(exitWithFailure).not.toHaveBeenCalled()

      if (outcome === 'resolve') flush.resolve()
      else flush.reject(new Error('flush failed'))
      await Promise.resolve()

      expect(exitWithFailure).toHaveBeenCalledOnce()
    },
  )

  it('logs and reports startup errors before flushing and exiting', async () => {
    const { server, emitStartupError } = makeServer()
    const flush = Promise.withResolvers<void>()
    const exitWithFailure = vi.fn<() => void>()
    const flushErrorReporting = vi.fn<() => Promise<void>>(() => flush.promise)
    const logError = vi.fn<(error: Error) => void>()
    const reportError = vi.fn<(error: Error) => void>()
    const error = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' })
    const deps = makeStartupDeps({
      exitWithFailure,
      flushErrorReporting,
      logError,
      reportError,
    })

    startApiServer(server, 4321, deps)
    emitStartupError(error)

    expect(logError).toHaveBeenCalledWith(error)
    expect(reportError).toHaveBeenCalledWith(error)
    expect(flushErrorReporting).toHaveBeenCalledOnce()
    expect(exitWithFailure).not.toHaveBeenCalled()

    flush.resolve()
    await flush.promise
    await new Promise(resolve => setImmediate(resolve))
    expect(exitWithFailure).toHaveBeenCalledOnce()
  })

  it('removes the startup error listener after the IPv6-safe bind succeeds', () => {
    const { server, emitListening } = makeServer()
    const logListening = vi.fn<(port: number) => void>()

    startApiServer(server, 4321, makeStartupDeps({ logListening }))
    emitListening()

    expect(server.off).toHaveBeenCalledWith('error', expect.any(Function))
    expect(logListening).toHaveBeenCalledWith(4321)
  })
})
