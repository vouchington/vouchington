import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bloomValkeyClient } from '@data-stores/valkey'
import { bloomFilters } from '@queues/bloom-filters/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  addKeyHashToBloomFilter,
  checkApiKeyBloomFilter,
  rebuildApiKeyBloomFilter,
  warmUpApiKeyBloomFilter,
} from './bloom-filter.mts'

const REBUILD_JOB_ID = 'bloomFilterRebuild__api-keys'
const READY_KEY = 'bloom-filter:api-keys:ready'
const unexpectedBloomClientCommands: string[] = []

const sdk = vi.hoisted(() => ({
  existsIfReady: vi.fn<(readyKey: string, item: string) => Promise<boolean | null>>(),
  isReady: vi.fn<(readyKey: string) => Promise<boolean>>(),
  addOrThrow: vi.fn<(items: string[]) => Promise<void>>(),
  rebuildFromStream: vi.fn<(batches: AsyncIterable<string[]>) => Promise<void>>(),
}))

vi.mock<typeof import('valkyries/bloom-filter')>(
  import('valkyries/bloom-filter'),
  async importOriginal => {
    const original = await importOriginal<typeof import('valkyries/bloom-filter')>()

    return {
      ...original,
      ValkeyBloomFilter: class extends original.ValkeyBloomFilter {
        override existsIfReady(readyKey: string, item: string): Promise<boolean | null> {
          return sdk.existsIfReady(readyKey, item)
        }

        override isReady(readyKey: string): Promise<boolean> {
          return sdk.isReady(readyKey)
        }

        override addOrThrow(items: string[]): Promise<void> {
          return sdk.addOrThrow(items)
        }

        override rebuildFromStream(batches: AsyncIterable<string[]>): Promise<void> {
          return sdk.rebuildFromStream(batches)
        }
      },
    }
  },
)

describe('API-key Bloom application policy', () => {
  beforeEach(async () => {
    unexpectedBloomClientCommands.length = 0
    sdk.existsIfReady.mockReset().mockResolvedValue(null)
    sdk.isReady.mockReset().mockResolvedValue(false)
    sdk.addOrThrow.mockReset().mockResolvedValue(undefined)
    sdk.rebuildFromStream.mockReset().mockResolvedValue(undefined)
    vi.spyOn(bloomValkeyClient, 'invokeScript').mockImplementation(async () => {
      unexpectedBloomClientCommands.push('invokeScript')
      throw new Error('Unexpected API-key Bloom SDK command')
    })
    vi.spyOn(bloomValkeyClient, 'customCommand').mockImplementation(async () => {
      unexpectedBloomClientCommands.push('customCommand')
      throw new Error('Unexpected API-key Bloom SDK command')
    })
    vi.spyOn(bloomValkeyClient, 'rename').mockImplementation(async () => {
      unexpectedBloomClientCommands.push('rename')
      throw new Error('Unexpected API-key Bloom SDK command')
    })
    vi.spyOn(bloomValkeyClient, 'set').mockResolvedValue('OK')
    vi.spyOn(bloomValkeyClient, 'unlink').mockResolvedValue(0)

    const previousJob = await bloomFilters.getJob(REBUILD_JOB_ID)
    await previousJob?.remove()
  })

  afterEach(async () => {
    try {
      const ownedJob = await bloomFilters.getJob(REBUILD_JOB_ID)
      await ownedJob?.remove()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('falls back on a missing filter and enqueues the owned API-key rebuild', async () => {
    const keyHash = Buffer.from('owned-api-key-hash')

    await expect(checkApiKeyBloomFilter(keyHash)).resolves.toBeNull()
    expect(sdk.existsIfReady).toHaveBeenCalledWith(READY_KEY, keyHash.toString('hex'))

    const rebuildJob = await bloomFilters.getJob(REBUILD_JOB_ID)
    expect(rebuildJob?.name).toBe('processRebuildBloomFilter')
    expect(rebuildJob?.data).toEqual({ filter: 'api-keys' })
    expect(bloomValkeyClient.set).not.toHaveBeenCalled()
    expect(bloomValkeyClient.unlink).not.toHaveBeenCalled()
    expect(unexpectedBloomClientCommands).toEqual([])
  })

  it('preserves a definite miss and treats an SDK read error as fallback without enqueueing', async () => {
    sdk.existsIfReady
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('owned Bloom read failure'))

    await expect(checkApiKeyBloomFilter(Buffer.from('not-present'))).resolves.toBe(false)
    await expect(checkApiKeyBloomFilter(Buffer.from('read-failed'))).resolves.toBeNull()
    expect(await bloomFilters.getJob(REBUILD_JOB_ID)).toBeNull()
    expect(bloomValkeyClient.set).not.toHaveBeenCalled()
    expect(bloomValkeyClient.unlink).not.toHaveBeenCalled()
    expect(unexpectedBloomClientCommands).toEqual([])
  })

  it('uses readiness to decide whether startup queues a rebuild', async () => {
    sdk.isReady.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await warmUpApiKeyBloomFilter()
    expect(await bloomFilters.getJob(REBUILD_JOB_ID)).toBeNull()

    await warmUpApiKeyBloomFilter()
    const rebuildJob = await bloomFilters.getJob(REBUILD_JOB_ID)
    expect(rebuildJob?.name).toBe('processRebuildBloomFilter')
    expect(rebuildJob?.data).toEqual({ filter: 'api-keys' })
    expect(bloomValkeyClient.set).not.toHaveBeenCalled()
    expect(bloomValkeyClient.unlink).not.toHaveBeenCalled()
    expect(unexpectedBloomClientCommands).toEqual([])
  })

  it('sets the ready marker only after the SDK rebuild resolves', async () => {
    const rebuild = Promise.withResolvers<void>()
    sdk.rebuildFromStream.mockReturnValueOnce(rebuild.promise)

    const pendingRebuild = rebuildApiKeyBloomFilter()
    expect(sdk.rebuildFromStream).toHaveBeenCalledOnce()
    expect(bloomValkeyClient.set).not.toHaveBeenCalled()

    rebuild.resolve()
    await pendingRebuild

    expect(bloomValkeyClient.set).toHaveBeenCalledWith(READY_KEY, '1')
    expect(unexpectedBloomClientCommands).toEqual([])
  })

  it('reports an add failure, invalidates readiness, and queues a rebuild only when a marker existed', async () => {
    const addError = new Error('owned add failure')
    sdk.addOrThrow.mockRejectedValueOnce(addError)
    vi.mocked(bloomValkeyClient.unlink).mockResolvedValueOnce(1)

    await expect(addKeyHashToBloomFilter(Buffer.from('new-api-key'))).resolves.toBeUndefined()

    expect(sdk.addOrThrow).toHaveBeenCalledWith([Buffer.from('new-api-key').toString('hex')])
    expect(bloomValkeyClient.unlink).toHaveBeenCalledWith([READY_KEY])
    expect(sentryCaptureExceptionMock.mock.calls.map(([error]) => error)).toEqual([addError])
    const rebuildJob = await bloomFilters.getJob(REBUILD_JOB_ID)
    expect(rebuildJob?.data).toEqual({ filter: 'api-keys' })
    expect(bloomValkeyClient.set).not.toHaveBeenCalled()
    expect(unexpectedBloomClientCommands).toEqual([])
  })

  it('does not enqueue after an add failure when the ready marker was absent', async () => {
    sdk.addOrThrow.mockRejectedValueOnce(new Error('owned add failure before readiness'))

    await expect(addKeyHashToBloomFilter(Buffer.from('new-api-key'))).resolves.toBeUndefined()

    expect(bloomValkeyClient.unlink).toHaveBeenCalledWith([READY_KEY])
    expect(await bloomFilters.getJob(REBUILD_JOB_ID)).toBeNull()
    expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce()
    expect(bloomValkeyClient.set).not.toHaveBeenCalled()
    expect(unexpectedBloomClientCommands).toEqual([])
  })

  it('reports a readiness-marker invalidation failure without queuing another rebuild', async () => {
    const addError = new Error('owned add failure')
    const unlinkError = new Error('owned marker invalidation failure')
    sdk.addOrThrow.mockRejectedValueOnce(addError)
    vi.mocked(bloomValkeyClient.unlink).mockRejectedValueOnce(unlinkError)

    await expect(addKeyHashToBloomFilter(Buffer.from('new-api-key'))).resolves.toBeUndefined()

    expect(sentryCaptureExceptionMock.mock.calls.map(([error]) => error)).toEqual([
      addError,
      unlinkError,
    ])
    expect(await bloomFilters.getJob(REBUILD_JOB_ID)).toBeNull()
    expect(unexpectedBloomClientCommands).toEqual([])
  })
})
