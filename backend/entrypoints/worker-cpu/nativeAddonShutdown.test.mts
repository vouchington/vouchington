import { describe, expect, it } from 'vitest'
import { registerNativeAddonShutdown } from './nativeAddonShutdown.mts'

type DrainCallback = () => Promise<void>

describe('registerNativeAddonShutdown', () => {
  it('registers a drain callback that sequences native addon shutdown', async () => {
    const drainCallbacks: DrainCallback[] = []
    const consoleLines: string[] = []

    registerNativeAddonShutdown({
      addGracefulShutdownDrainCallback: callback => {
        drainCallbacks.push(callback)
        return 1
      },
      beginNativeAddonShutdown: () => {
        consoleLines.push('begin')
      },
      waitForNativeAddonWorkToDrain: async () => {
        consoleLines.push('wait')
      },
    })

    const drainCallback = drainCallbacks[0]
    expect(drainCallback).toBeDefined()

    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      consoleLines.push(String(args[0]))
    }
    try {
      await drainCallback!()
    } finally {
      console.log = originalLog
    }

    expect(consoleLines).toEqual([
      'Workers: draining native addon work...',
      'begin',
      'wait',
      'Workers: native addon work drained.',
    ])
  })
})
