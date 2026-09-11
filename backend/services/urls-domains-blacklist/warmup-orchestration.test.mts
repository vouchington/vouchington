import { describe, expect, it } from 'vitest'
import { warmUpBlocklistBloomFilter } from './warmup-orchestration.mts'

describe('warmUpBlocklistBloomFilter', () => {
  it('does not inspect or create a filter when the database has no blocklist data', async () => {
    const calls: string[] = []

    await warmUpBlocklistBloomFilter({
      hasData: async () => false,
      isReady: async () => {
        calls.push('isReady')
        return false
      },
      enqueueRebuild: async () => {
        calls.push('enqueueRebuild')
      },
    })

    expect(calls).toEqual([])
  })

  it('does not enqueue a rebuild when the completed filter is ready', async () => {
    const calls: string[] = []

    await warmUpBlocklistBloomFilter({
      hasData: async () => true,
      isReady: async () => true,
      enqueueRebuild: async () => {
        calls.push('enqueueRebuild')
      },
    })

    expect(calls).toEqual([])
  })

  it('only enqueues a rebuild when data exists and the filter is not ready', async () => {
    const calls: string[] = []

    await warmUpBlocklistBloomFilter({
      hasData: async () => {
        calls.push('hasData')
        return true
      },
      isReady: async () => {
        calls.push('isReady')
        return false
      },
      enqueueRebuild: async () => {
        calls.push('enqueueRebuild')
      },
    })

    expect(calls).toEqual(['hasData', 'isReady', 'enqueueRebuild'])
  })
})
