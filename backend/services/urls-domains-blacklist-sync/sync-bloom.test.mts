import { describe, expect, it, vi } from 'vitest'
import { rebuildBloomForSource } from './sync-bloom.mts'

type BloomRebuildDependencies = Parameters<typeof rebuildBloomForSource>[1]

function dependencies(invalidate: () => Promise<unknown>) {
  return {
    invalidateEmailReadyMarker: invalidate,
    invalidateUrlReadyMarker: invalidate,
    enqueueEmailRebuild: vi.fn<BloomRebuildDependencies['enqueueEmailRebuild']>(async () => {}),
    enqueueUrlRebuild: vi.fn<BloomRebuildDependencies['enqueueUrlRebuild']>(async () => {}),
  }
}

describe('rebuildBloomForSource', () => {
  it.each(['url', 'email'] as const)(
    'still queues the %s rebuild when the generation bump fails',
    async sourceType => {
      const deps = dependencies(async () => {
        throw new Error('bump failed')
      })
      await expect(rebuildBloomForSource(sourceType, deps)).rejects.toThrow('bump failed')
      const enqueue = sourceType === 'url' ? deps.enqueueUrlRebuild : deps.enqueueEmailRebuild
      expect(enqueue).toHaveBeenCalledOnce()
    },
  )

  it('queues the rebuild after a successful invalidation', async () => {
    const deps = dependencies(async () => 1)
    await rebuildBloomForSource('url', deps)
    expect(deps.enqueueUrlRebuild).toHaveBeenCalledOnce()
  })
})
