import { describe, expect, it, vi } from 'vitest'
import { detachedBackgroundWork } from './detached-background-work.mts'

describe('detached background work', () => {
  it('keeps its marker across module reloads without changing the caller scope', async () => {
    expect(detachedBackgroundWork.isDetached()).toBe(false)
    let observedAfterReload = false
    await detachedBackgroundWork.run(async () => {
      await Promise.resolve()
      vi.resetModules()
      const reloaded = await import('./detached-background-work.mts')
      observedAfterReload = reloaded.detachedBackgroundWork.isDetached()
    })
    expect(observedAfterReload).toBe(true)
    expect(detachedBackgroundWork.isDetached()).toBe(false)
  })
})
