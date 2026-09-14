import fs from 'node:fs'

import os from 'node:os'

import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PutRecordBatchCommandInput, PutRecordBatchCommandOutput } from '@modules/aws/firehose'

import { emit } from '../emit.mts'

import { onGracefulShutdown } from '../graceful-shutdown.mts'

import { writeRecord as writeLocalRecord } from '../backend-local.mts'
import { suppressedError } from '../../../test-helpers/data-stores/analytics/suppressed-error.mts'

import {
  flush,
  setFirehoseRecordBatchSenderForTest,
  setFirehoseRetryDelayForTest,
  setFirehoseRetryWaitForTest,
  writeRecord,
} from '../backend-firehose.mts'

type PutBatch = (input: PutRecordBatchCommandInput) => Promise<PutRecordBatchCommandOutput>

describe('backend-firehose', () => {
  const originalBackend = process.env.ANALYTICS_BACKEND

  const originalLocalDir = process.env.ANALYTICS_LOCAL_DIR

  const originalPrefix = process.env.ANALYTICS_FIREHOSE_PREFIX

  let restoreSender: (() => void) | undefined

  let restoreRetryDelay: (() => void) | undefined

  let restoreRetryWait: (() => void) | undefined

  let calls: PutRecordBatchCommandInput[]

  let responses: Array<PutRecordBatchCommandOutput | Error>

  beforeEach(async () => {
    process.env.ANALYTICS_FIREHOSE_PREFIX = 'voucha-analytics-test-'
    calls = []
    responses = []
    const sender: PutBatch = input => {
      calls.push(input)
      const response = responses.shift()
      if (response instanceof Error) return Promise.reject(response)
      return Promise.resolve(response ?? makeFirehoseOutput())
    }
    restoreSender = setFirehoseRecordBatchSenderForTest(sender)
    restoreRetryDelay = setFirehoseRetryDelayForTest(0)
    restoreRetryWait = setFirehoseRetryWaitForTest(() => Promise.resolve())
    await flush()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await flush()
    restoreSender?.()
    restoreRetryDelay?.()
    restoreRetryWait?.()
    if (originalPrefix === undefined) {
      delete process.env.ANALYTICS_FIREHOSE_PREFIX
    } else {
      process.env.ANALYTICS_FIREHOSE_PREFIX = originalPrefix
    }
    if (originalBackend === undefined) {
      delete process.env.ANALYTICS_BACKEND
    } else {
      process.env.ANALYTICS_BACKEND = originalBackend
    }
    if (originalLocalDir === undefined) {
      delete process.env.ANALYTICS_LOCAL_DIR
    } else {
      process.env.ANALYTICS_LOCAL_DIR = originalLocalDir
    }
  })

  function decodeRecord(input: PutRecordBatchCommandInput): string {
    const data = input.Records?.[0]?.Data
    expect(data).toBeInstanceOf(Uint8Array)
    return new TextDecoder().decode(data as Uint8Array)
  }

  function makeFirehoseOutput(): PutRecordBatchCommandOutput {
    return { $metadata: {}, FailedPutCount: 0, RequestResponses: [] }
  }

  function makeQueueWorkerRecord(overrides: { event_id: string }) {
    return {
      event_time: new Date('2026-01-02T03:04:05.000Z'),
      event_date: '2026-01-02',
      event_id: overrides.event_id,
      env: 'test',
      queue: 'psql',
      event: 'active',
    }
  }

  it('flushes records on the timer', async () => {
    vi.useFakeTimers()
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'timer' }))

    await vi.advanceTimersByTimeAsync(1_100)

    expect(calls).toHaveLength(1)
    expect(JSON.parse(decodeRecord(calls[0]!))).toMatchObject({ event_id: 'timer' })
  })

  it('sends newline-delimited JSON records to the table-specific stream', async () => {
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'event-1' }))

    await flush()

    expect(calls).toHaveLength(1)
    const input = calls[0]!
    expect(input.DeliveryStreamName).toBe('voucha-analytics-test-queue_workers')
    const payload = decodeRecord(input)
    expect(payload.endsWith('\n')).toBe(true)
    expect(JSON.parse(payload)).toMatchObject({
      event_id: 'event-1',
      queue: 'psql',
      event: 'active',
    })
  })

  it('splits batches at the 500-record Firehose limit', async () => {
    for (let index = 0; index < 501; index += 1) {
      writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: `event-${index}` }))
    }

    await new Promise(resolve => setImmediate(resolve))
    await flush()

    expect(calls).toHaveLength(2)
    expect(calls[0]!.Records).toHaveLength(500)
    expect(calls[1]!.Records).toHaveLength(1)
  })

  it('splits batches at the Firehose byte limit', async () => {
    for (let index = 0; index < 5; index += 1) {
      const record = {
        ...makeQueueWorkerRecord({ event_id: `large-${index}` }),
        payload: 'x'.repeat(900_000),
      }
      writeRecord('queue_workers', record)
    }

    await flush()

    expect(calls).toHaveLength(2)
  })

  it('drops records that exceed the Firehose record limit', async () => {
    const record = {
      ...makeQueueWorkerRecord({ event_id: 'oversized' }),
      payload: 'x'.repeat(1_030_000),
    }

    writeRecord('queue_workers', record)
    await flush()

    expect(calls).toHaveLength(0)
  })

  it('retries only failed records once', async () => {
    responses.push(
      {
        $metadata: {},
        FailedPutCount: 1,
        RequestResponses: [{ RecordId: 'ok' }, { ErrorCode: 'ServiceUnavailable' }],
      },
      {
        $metadata: {},
        FailedPutCount: 0,
        RequestResponses: [{ RecordId: 'retry-ok' }],
      },
    )
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'ok' }))
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'retry' }))

    await flush()

    expect(calls).toHaveLength(2)
    expect(calls[1]!.Records).toHaveLength(1)
  })

  it('retries request errors once before dropping the batch', async () => {
    responses.push(suppressedError('firehose unavailable'), suppressedError('firehose unavailable'))
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'event-1' }))

    await flush()

    expect(calls).toHaveLength(2)
  })

  it('drains records added while a flush is in progress', async () => {
    let releaseFirstSend: ((output: PutRecordBatchCommandOutput) => void) | undefined
    const firstSendStarted = new Promise<void>(resolve => {
      restoreSender?.()
      restoreSender = setFirehoseRecordBatchSenderForTest(input => {
        calls.push(input)
        if (calls.length === 1) {
          resolve()
          return new Promise<PutRecordBatchCommandOutput>(release => {
            releaseFirstSend = release
          })
        }

        return Promise.resolve(makeFirehoseOutput())
      })
    })

    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'first' }))
    const flushPromise = flush()
    await firstSendStarted

    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'second' }))
    releaseFirstSend?.(makeFirehoseOutput())
    await flushPromise

    expect(calls).toHaveLength(2)
    expect(JSON.parse(decodeRecord(calls[1]!))).toMatchObject({ event_id: 'second' })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof fs)
  void (0 as unknown as typeof os)
  void (0 as unknown as typeof path)
  void (0 as unknown as typeof emit)
  void (0 as unknown as typeof onGracefulShutdown)
  void (0 as unknown as typeof writeLocalRecord)
})
