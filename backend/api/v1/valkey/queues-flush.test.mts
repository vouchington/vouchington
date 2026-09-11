import { afterEach, describe, expect, it, vi } from 'vitest'
import { Queue } from 'glide-mq'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueCommandClient,
} from '@data-stores/valkey-glide-mq'
import {
  allLiveWorkerQueueNames,
  UNIVERSAL_WORKER_QUEUE_NAMES,
} from '@modules/worker-queue-inventory'
import {
  flushQueues,
  getQueueFlushTargetNames,
  getQueueFlushTargetPrefixes,
  scanUnlinkUsageKeys,
} from './queues-flush.mts'

describe('queue flush targets', () => {
  it('includes every live worker queue exactly once', () => {
    const targets = getQueueFlushTargetNames()
    expect(targets).toEqual(expect.arrayContaining(allLiveWorkerQueueNames()))
    expect(new Set(targets).size).toBe(targets.length)
    expect(targets).toContain(UNIVERSAL_WORKER_QUEUE_NAMES[0])
  })

  it('derives queue and usage prefixes from the configured prefix', () => {
    const prefixes = getQueueFlushTargetPrefixes('voucha_qdb_7')
    expect(prefixes).toContain('voucha_qdb_7:{emails}:')
    expect(prefixes).toContain('voucha_qdb_7:usage:')
    expect(prefixes.at(-1)).toBe('voucha_qdb_7:usage:')
    expect(prefixes.every(prefix => !prefix.startsWith('glide:'))).toBe(true)
  })
})

describe('scanUnlinkUsageKeys', () => {
  it('rethrows scan failures instead of swallowing them', async () => {
    const scanError = new Error('scan boom')
    const client = {
      scan: () => Promise.reject(scanError),
    } as unknown as typeof workerQueueCommandClient

    await expect(scanUnlinkUsageKeys(client)).rejects.toBe(scanError)
  })

  it('does not unlink when cancellation arrives during a scan', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel usage scan')
    let unlinkCalls = 0
    const client = {
      async scan() {
        controller.abort(reason)
        return ['1', ['glide:usage:one']] as const
      },
      async unlink() {
        unlinkCalls += 1
        return 1
      },
    }

    await expect(scanUnlinkUsageKeys(client as never, controller.signal)).rejects.toBe(reason)
    expect(unlinkCalls).toBe(0)
  })
})

describe('flushQueues', () => {
  const obliterate = vi.spyOn(Queue.prototype, 'obliterate')
  const close = vi.spyOn(Queue.prototype, 'close')

  afterEach(() => {
    obliterate.mockReset()
    close.mockReset()
  })

  it('obliterates every target with force and closes every temporary handle', async () => {
    obliterate.mockResolvedValue(undefined)
    close.mockResolvedValue(undefined)

    await expect(flushQueues()).resolves.toEqual({ concern: 'queues', keysRemoved: null })

    expect(obliterate).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
    for (const call of obliterate.mock.calls) expect(call[0]).toEqual({ force: true })
    expect(close).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
  })

  it('reports an obliterate failure and still closes every temporary handle', async () => {
    const error = new Error('obliterate boom')
    obliterate.mockRejectedValue(error)
    close.mockResolvedValue(undefined)

    await expect(flushQueues()).rejects.toMatchObject({
      errors: expect.arrayContaining([error]),
    })
    expect(obliterate).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
    expect(close).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
  })

  it('waits for sibling obliterations before closing handles', async () => {
    const sibling = Promise.withResolvers<void>()
    const error = new Error('obliterate boom')
    let callIndex = 0
    obliterate.mockImplementation(() => {
      callIndex += 1
      if (callIndex === 1) return Promise.reject(error)
      if (callIndex === 2) return sibling.promise
      return Promise.resolve()
    })
    close.mockResolvedValue(undefined)

    const flush = flushQueues()
    const flushError = flush.catch(caught => caught)
    await vi.waitFor(() => expect(obliterate.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(close).not.toHaveBeenCalled()

    sibling.resolve()
    await expect(flushError).resolves.toMatchObject({ errors: [error] })
    expect(close).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
  })

  it('rejects and leaves failed handles registered when cleanup fails', async () => {
    const closeError = new Error('close boom')
    obliterate.mockResolvedValue(undefined)
    close.mockRejectedValueOnce(closeError).mockResolvedValue(undefined)

    try {
      await expect(flushQueues()).rejects.toMatchObject({
        errors: [closeError],
        message: 'Queue flush handle cleanup failed',
      })
      expect(close).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
    } finally {
      const failedHandle = close.mock.contexts[0] as Queue | undefined
      if (failedHandle) {
        close.mockResolvedValue(undefined)
        await closeAndUnregisterGlideMQInstance(failedHandle)
      }
    }
  })

  it('aggregates obliteration and handle-close failures', async () => {
    const obliterateError = new Error('obliterate boom')
    const closeError = new Error('close boom')
    obliterate.mockRejectedValue(obliterateError)
    close.mockRejectedValueOnce(closeError).mockResolvedValue(undefined)

    try {
      await expect(flushQueues()).rejects.toMatchObject({
        errors: [{ errors: expect.arrayContaining([obliterateError]) }, closeError],
        message: 'Queue flush handle cleanup failed',
      })
    } finally {
      const failedHandle = close.mock.contexts[0] as Queue | undefined
      if (failedHandle) {
        close.mockResolvedValue(undefined)
        await closeAndUnregisterGlideMQInstance(failedHandle)
      }
    }
  })

  it('keeps usage cleanup best-effort after successful obliteration', async () => {
    obliterate.mockResolvedValue(undefined)
    close.mockResolvedValue(undefined)
    const client = {
      scan: () => Promise.reject(new Error('usage scan boom')),
    } as unknown as typeof workerQueueCommandClient

    await expect(flushQueues(undefined, client)).resolves.toEqual({
      concern: 'queues',
      keysRemoved: null,
    })
  })

  it('stops starting obliterations after cancellation and closes every handle', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel queue obliteration')
    obliterate.mockImplementationOnce(async () => controller.abort(reason))
    close.mockResolvedValue(undefined)

    await expect(flushQueues(controller.signal)).rejects.toBe(reason)
    expect(obliterate).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
  })

  it('preserves independent obliteration failures alongside cancellation', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel queue obliteration')
    const obliterateError = new Error('obliterate boom')
    const aborter = Promise.withResolvers<void>()
    let callIndex = 0
    obliterate.mockImplementation(async () => {
      callIndex += 1
      if (callIndex === 1) {
        await aborter.promise
        controller.abort(reason)
      } else if (callIndex === 2) {
        throw obliterateError
      }
    })
    close.mockResolvedValue(undefined)

    const flush = flushQueues(controller.signal)
    const flushRejection = flush.catch((error: unknown) => error)
    await vi.waitFor(() => expect(obliterate.mock.calls.length).toBeGreaterThanOrEqual(2))
    aborter.resolve()

    await expect(flushRejection).resolves.toMatchObject({
      errors: expect.arrayContaining([reason, obliterateError]),
    })
    expect(close).toHaveBeenCalledTimes(getQueueFlushTargetNames().length)
  })

  it('does not swallow cancellation from usage cleanup', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel queue usage cleanup')
    let unlinkCalls = 0
    obliterate.mockResolvedValue(undefined)
    close.mockResolvedValue(undefined)
    const client = {
      async scan() {
        controller.abort(reason)
        return ['1', ['glide:usage:one']] as const
      },
      async unlink() {
        unlinkCalls += 1
        return 1
      },
    } as unknown as typeof workerQueueCommandClient

    await expect(flushQueues(controller.signal, client)).rejects.toBe(reason)
    expect(unlinkCalls).toBe(0)
  })
})
