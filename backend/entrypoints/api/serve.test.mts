import { describe, expect, it } from 'vitest'
import { registerProductionApiShutdownCallbacks } from './shutdown.mts'

type AsyncCallback = () => Promise<void>

describe('api serve shutdown callbacks', () => {
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
})
