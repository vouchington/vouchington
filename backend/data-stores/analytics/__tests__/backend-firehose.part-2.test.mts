import fs from 'node:fs'

import os from 'node:os'

import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PutRecordBatchCommandInput, PutRecordBatchCommandOutput } from '@modules/aws/firehose'

import { emit } from '../emit.mts'

import { onGracefulShutdown } from '../graceful-shutdown.mts'

import { writeRecord as writeLocalRecord } from '../backend-local.mts'

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

  it('waits for an active flush before resolving a concurrent flush', async () => {
    let releaseFirstSend: ((output: PutRecordBatchCommandOutput) => void) | undefined
    const firstSendStarted = new Promise<void>(resolve => {
      restoreSender?.()
      restoreSender = setFirehoseRecordBatchSenderForTest(input => {
        calls.push(input)
        resolve()
        return new Promise<PutRecordBatchCommandOutput>(release => {
          releaseFirstSend = release
        })
      })
    })

    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'first' }))
    const firstFlushPromise = flush()
    await firstSendStarted

    let concurrentFlushResolved = false
    const concurrentFlushPromise = flush().then(() => {
      concurrentFlushResolved = true
      return undefined
    })
    await new Promise(resolve => setImmediate(resolve))

    expect(concurrentFlushResolved).toBe(false)
    releaseFirstSend?.(makeFirehoseOutput())
    await Promise.all([firstFlushPromise, concurrentFlushPromise])

    expect(concurrentFlushResolved).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('waits before retrying failed records', async () => {
    restoreRetryDelay?.()
    restoreRetryDelay = setFirehoseRetryDelayForTest(100)
    const requestedDelays: number[] = []
    restoreRetryWait?.()
    restoreRetryWait = setFirehoseRetryWaitForTest(delayMs => {
      requestedDelays.push(delayMs)
      return Promise.resolve()
    })
    responses.push(
      {
        $metadata: {},
        FailedPutCount: 1,
        RequestResponses: [{ ErrorCode: 'ServiceUnavailable' }],
      },
      makeFirehoseOutput(),
    )

    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'retry-delay' }))
    await flush()

    expect(calls).toHaveLength(2)
    expect(requestedDelays).toEqual([100])
  })

  it('writes Firehose records through emit()', async () => {
    process.env.ANALYTICS_BACKEND = 'firehose'

    emit('queue_workers', makeQueueWorkerRecord({ event_id: 'emit' }))
    await flush()

    expect(calls).toHaveLength(1)
    expect(JSON.parse(decodeRecord(calls[0]!))).toMatchObject({ event_id: 'emit' })
  })

  it('flushes Firehose records on graceful shutdown', async () => {
    process.env.ANALYTICS_BACKEND = 'firehose'
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'shutdown-firehose' }))

    await onGracefulShutdown()

    expect(calls).toHaveLength(1)
    expect(JSON.parse(decodeRecord(calls[0]!))).toMatchObject({
      event_id: 'shutdown-firehose',
    })
  })

  it('flushes local records on graceful shutdown', async () => {
    const localDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-shutdown-'))
    process.env.ANALYTICS_BACKEND = 'local'
    process.env.ANALYTICS_LOCAL_DIR = localDir
    writeLocalRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'shutdown-local' }))

    await onGracefulShutdown()

    const text = await fs.promises.readFile(
      path.join(localDir, 'queue_workers', '2026-01-02.jsonl'),
      'utf8',
    )
    expect(text).toContain('"event_id":"shutdown-local"')
    await fs.promises.rm(localDir, { recursive: true, force: true })
  })
})
