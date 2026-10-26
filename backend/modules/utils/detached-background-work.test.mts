import { describe, expect, it, vi } from 'vitest'
import { isDetachedBackgroundWork, runDetachedBackgroundWork } from './detached-background-work.mts'

describe('detached background work', () => {
  it('keeps its marker across module reloads without changing the caller scope', async () => {
    expect(isDetachedBackgroundWork()).toBe(false)
    let observedAfterReload = false
    await runDetachedBackgroundWork(async () => {
      await Promise.resolve()
      vi.resetModules()
      const reloaded = await import('./detached-background-work.mts')
      observedAfterReload = reloaded.isDetachedBackgroundWork()
    })
    expect(observedAfterReload).toBe(true)
    expect(isDetachedBackgroundWork()).toBe(false)
  })
})
