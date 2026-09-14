import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  registerApiShutdownCallbacks,
  registerProductionApiShutdownCallbacks,
} from './shutdown.mts'

type AsyncCallback = () => Promise<void>

describe('api serve shutdown callbacks', () => {
  it('registers native addon drain after server termination and begins shutdown before waiting', async () => {
    const events: string[] = []
    const shutdownCallbacks: AsyncCallback[] = []
    let drainCallback: AsyncCallback | undefined

    registerApiShutdownCallbacks({
      addShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return shutdownCallbacks.length
      },
      addDrainCallback: callback => {
        drainCallback = callback
        return 2
      },
      terminate: () => {
        events.push('terminate')
        return Promise.resolve()
      },
      beginNativeShutdown: () => {
        events.push('begin-native-shutdown')
      },
      waitForNativeDrain: () => {
        events.push('wait-for-native-drain')
        return Promise.resolve()
      },
      log: () => {},
    })

    expect(shutdownCallbacks).toHaveLength(1)
    expect(drainCallback).toBeDefined()

    for (const callback of shutdownCallbacks) {
      await callback()
    }
    await drainCallback!()

    expect(events).toEqual(['terminate', 'begin-native-shutdown', 'wait-for-native-drain'])
  })

  it('wires production shutdown callbacks through native server-close methods', async () => {
    const events: string[] = []
    const shutdownCallbacks: AsyncCallback[] = []
    let drainCallback: AsyncCallback | undefined
    const server = {
      close: (callback: (error?: Error) => void) => {
        events.push('close')
        callback()
      },
      closeIdleConnections: () => {
        events.push('closeIdleConnections')
      },
      closeAllConnections: () => {
        events.push('closeAllConnections')
      },
    } as unknown as Parameters<typeof registerProductionApiShutdownCallbacks>[0]

    registerProductionApiShutdownCallbacks(server, {
      addShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return shutdownCallbacks.length
      },
      addDrainCallback: callback => {
        drainCallback = callback
        return 2
      },
      beginNativeShutdown: () => {
        events.push('begin-native-shutdown')
      },
      waitForNativeDrain: () => {
        events.push('wait-for-native-drain')
        return Promise.resolve()
      },
      log: () => {},
    })

    expect(shutdownCallbacks).toHaveLength(1)
    expect(drainCallback).toBeDefined()

    for (const callback of shutdownCallbacks) {
      await callback()
    }
    await drainCallback!()

    // `close`'s callback fires synchronously above (simulating an immediate, no-sockets
    // drain), but the Promise it resolves only settles as a microtask — so `closeIdleConnections`
    // still runs before `terminateHttpServer`'s awaited promise continues. The forced
    // `closeAllConnections()` fallback is on an unref'd real timer and never fires here.
    expect(events).toEqual([
      'close',
      'closeIdleConnections',
      'begin-native-shutdown',
      'wait-for-native-drain',
    ])
  })

  it('propagates a server.close error as a rejected terminate call', async () => {
    const shutdownCallbacks: AsyncCallback[] = []
    const closeError = new Error('close failed')
    const server = {
      close: (callback: (error?: Error) => void) => {
        callback(closeError)
      },
      closeIdleConnections: () => {},
      closeAllConnections: () => {},
    } as unknown as Parameters<typeof registerProductionApiShutdownCallbacks>[0]

    registerProductionApiShutdownCallbacks(server, {
      addShutdownCallback: callback => {
        shutdownCallbacks.push(callback)
        return shutdownCallbacks.length
      },
      addDrainCallback: () => 2,
      beginNativeShutdown: () => {},
      waitForNativeDrain: () => Promise.resolve(),
      log: () => {},
    })

    expect(shutdownCallbacks).toHaveLength(1)
    await expect(shutdownCallbacks[0]!()).rejects.toThrow(closeError)
  })

  it('keeps the production entrypoint registered with shutdown callbacks', async () => {
    const source = await readFile(new URL('./serve.mts', import.meta.url), 'utf8')

    expect(source).toContain('registerProductionApiShutdownCallbacks(server,')
    expect(source).toContain('validateRuntimeImageOrigin()')
    expect(source).toContain('installApiEgressProxyRoutingResolver(isApiEgressProxyEnabled)')
  })

  it('wires both fatal boot guards through the deploy-environment-aware predicates', async () => {
    const source = await readFile(new URL('./serve.mts', import.meta.url), 'utf8')

    expect(source).toContain('shouldRejectTurnstileTestSecret(turnstileSecretKey,')
    expect(source).toContain('shouldRejectSkipCaptchaVerification()')
    expect(source).not.toContain("NODE_ENV === 'production'")
  })

  it('starts the production server through the covered startup helper', async () => {
    const source = await readFile(new URL('./serve.mts', import.meta.url), 'utf8')

    expect(source).toContain('startApiServer(server, PORT, {')
    expect(source).toContain('ensurePlaywrightLocalizationSqlite')
    expect(source).toContain("'@services/localization/compile-catalog'")
    expect(source).not.toContain("'@services/localization/compile-catalog.mts'")
    expect(source).toContain('exitAfterErrorReporting(() => flushSentry(2000), exitWithFailure)')
    expect(source).toContain('exitWithFailure,')
    expect(source).toContain('flushErrorReporting: () => flushSentry(2000)')
    expect(source).toContain('logError: error => console.error(error)')
    expect(source).toContain('logListening: listeningPort =>')
    expect(source).toContain(
      "console.log('API Server: serving at http://localhost:%s', listeningPort)",
    )
    expect(source).toContain('reportError: onError')
    expect(source).not.toContain('server.listen(')
  })

  it('sets explicit SSE-safe http.createServer timeouts and leaves server.timeout disabled', async () => {
    const source = await readFile(new URL('./serve.mts', import.meta.url), 'utf8')

    expect(source).toContain('requestTimeout: 300_000')
    expect(source).toContain('headersTimeout: 60_000')
    expect(source).toContain('keepAliveTimeout: 5_000')
    expect(source).not.toMatch(/\btimeout:\s*\d/)
  })
})
