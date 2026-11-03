import { afterEach, describe, expect, it, vi } from 'vitest'
import * as bloomFilterEnqueues from '@queues/bloom-filters/enqueues'
import { bloomValkeyClient } from '@data-stores/valkey'
import { answerPostgresReadsForTest } from '@voucha/test-helpers/injected-failures'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { warmUpEmailBlocklistBloomFilter } from './email-bloom-filter.mts'
import { blocklistBloomReadyKey } from './ready-marker.mts'

const readyKey = blocklistBloomReadyKey('email-blocklist')

/** Answers only the email ready-marker EXISTS as absent; every other Valkey command is real. */
function reportEmailReadyMarkerAbsent() {
  const realCustomCommand = bloomValkeyClient.customCommand
  vi.spyOn(bloomValkeyClient, 'customCommand').mockImplementation((args, ...rest) => {
    if (args[0] === 'EXISTS' && args[1] === readyKey) return Promise.resolve(0)
    return realCustomCommand.call(bloomValkeyClient, args, ...rest)
  })
}

describe('warmUpEmailBlocklistBloomFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enqueues exactly one email rebuild when blocklist data exists and the ready marker is absent', async () => {
    const restoreReads = answerPostgresReadsForTest('/* warmUpEmailBlocklistBloomFilter */', [
      [{ domain: 'blocked.example' }],
    ])
    const enqueueSpy = vi
      .spyOn(bloomFilterEnqueues, 'enqueueRebuildBloomFilter')
      .mockResolvedValue(undefined as never)
    reportEmailReadyMarkerAbsent()

    try {
      await warmUpEmailBlocklistBloomFilter()
    } finally {
      restoreReads()
    }

    expect(enqueueSpy).toHaveBeenCalledTimes(1)
    expect(enqueueSpy).toHaveBeenCalledWith({ filter: 'email-blocklist' })
  })

  it('resolves and reports the error when the rebuild enqueue fails', async () => {
    const enqueueError = new Error('rebuild enqueue failed')
    const restoreReads = answerPostgresReadsForTest('/* warmUpEmailBlocklistBloomFilter */', [
      [{ domain: 'blocked.example' }],
    ])
    vi.spyOn(bloomFilterEnqueues, 'enqueueRebuildBloomFilter').mockRejectedValue(enqueueError)
    reportEmailReadyMarkerAbsent()

    try {
      await expect(warmUpEmailBlocklistBloomFilter()).resolves.toBeUndefined()
    } finally {
      restoreReads()
    }

    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(enqueueError, expect.anything())
  })
})
