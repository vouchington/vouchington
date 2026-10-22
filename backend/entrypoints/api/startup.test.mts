import { afterEach, describe, expect, it, vi } from 'vitest'
import type http from 'node:http'
import { exitAfterErrorReporting, startApiServer } from './startup.mts'
import { derivePublicJwk, encodeJwkSetForEnv } from '@ts-shared/session-jwt'
import testPrivateKey from '@ts-shared/session-jwt/test-jwt-private-key'

type StartupDeps = Parameters<typeof startApiServer>[2]

function makeStartupDeps(overrides: Partial<StartupDeps> = {}): StartupDeps {
  return {
    prepare: vi.fn<() => Promise<void>>(async () => {}),
    exitWithFailure: vi.fn<() => void>(),
    flushErrorReporting: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    logError: vi.fn<(error: Error) => void>(),
    logListening: vi.fn<(port: number) => void>(),
    reportError: vi.fn<(error: Error) => void>(),
    ...overrides,
  }
}

function configureDeployedEnvironment(environment: string): void {
  vi.stubEnv('ENVIRONMENT', environment)
  vi.stubEnv('PLAYWRIGHT_TEST', 'false')
  vi.stubEnv('VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64', encodeJwkSetForEnv([testPrivateKey]))
  vi.stubEnv(
    'VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64',
    encodeJwkSetForEnv([derivePublicJwk(testPrivateKey)]),
  )
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
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['staging', 'production'])(
    'rejects missing %s keys before preparation or binding',
    async environment => {
      configureDeployedEnvironment(environment)
      vi.stubEnv('VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64', '')
      vi.stubEnv('VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64', '')
      const { server } = makeServer()
      const deps = makeStartupDeps()

      await expect(startApiServer(server, 4321, deps)).rejects.toThrow('must be configured')
      expect(deps.prepare).not.toHaveBeenCalled()
      expect(server.listen).not.toHaveBeenCalled()
    },
  )

  it.each(['staging', 'production'])(
    'rejects the %s Playwright bypass before preparation or binding',
    async environment => {
      configureDeployedEnvironment(environment)
      vi.stubEnv('PLAYWRIGHT_TEST', 'true')
      const { server } = makeServer()
      const deps = makeStartupDeps()

      await expect(startApiServer(server, 4321, deps)).rejects.toThrow('PLAYWRIGHT_TEST')
      expect(deps.prepare).not.toHaveBeenCalled()
      expect(server.listen).not.toHaveBeenCalled()
    },
  )

  it('waits for preparation after valid deployed keys and before binding', async () => {
    configureDeployedEnvironment('staging')
    const prepared = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const { server } = makeServer()
    const starting = startApiServer(
      server,
      4321,
      makeStartupDeps({
        prepare: async () => {
          prepared.resolve()
          await release.promise
        },
      }),
    )

    await prepared.promise
    expect(server.listen).not.toHaveBeenCalled()
    release.resolve()
    await starting
    expect(server.listen).toHaveBeenCalledOnce()
  })

  it('propagates a preparation failure without binding', async () => {
    configureDeployedEnvironment('staging')
    const error = new Error('localization preparation failed')
    const { server } = makeServer()
    const deps = makeStartupDeps({
      prepare: async () => {
        throw error
      },
    })

    await expect(startApiServer(server, 4321, deps)).rejects.toBe(error)
    expect(server.listen).not.toHaveBeenCalled()
  })
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
    const exited = Promise.withResolvers<void>()
    const exitWithFailure = vi.fn<() => void>(() => exited.resolve())
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

    await startApiServer(server, 4321, deps)
    emitStartupError(error)

    expect(logError).toHaveBeenCalledWith(error)
    expect(reportError).toHaveBeenCalledWith(error)
    expect(flushErrorReporting).toHaveBeenCalledOnce()
    expect(exitWithFailure).not.toHaveBeenCalled()

    flush.resolve()
    await exited.promise
    expect(exitWithFailure).toHaveBeenCalledOnce()
  })

  it('removes the startup error listener after the IPv6-safe bind succeeds', async () => {
    const { server, emitListening } = makeServer()
    const logListening = vi.fn<(port: number) => void>()

    await startApiServer(server, 4321, makeStartupDeps({ logListening }))
    emitListening()

    expect(server.off).toHaveBeenCalledWith('error', expect.any(Function))
    expect(logListening).toHaveBeenCalledWith(4321)
  })
})
