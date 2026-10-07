import fs from 'node:fs'

import os from 'node:os'

import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import type { PutRecordBatchCommandInput, PutRecordBatchCommandOutput } from '@modules/aws/firehose'
import * as firehoseProvider from '@modules/aws/firehose'

import { emit } from '../emit.mts'

import { onGracefulShutdown } from '../graceful-shutdown.mts'

import { writeRecord as writeLocalRecord } from '../backend-local.mts'

import { flush, writeRecord } from '../backend-firehose.mts'
type PutBatch = (input: PutRecordBatchCommandInput) => Promise<PutRecordBatchCommandOutput>

describe('backend-firehose', () => {
  const originalBackend = process.env.ANALYTICS_BACKEND

  const originalLocalDir = process.env.ANALYTICS_LOCAL_DIR

  const originalPrefix = process.env.ANALYTICS_FIREHOSE_PREFIX

  let calls: PutRecordBatchCommandInput[]

  let responses: Array<PutRecordBatchCommandOutput | Error>

  let firehoseSender: MockInstance<PutBatch>

  beforeEach(async () => {
    process.env.ANALYTICS_FIREHOSE_PREFIX = 'voucha-analytics-test-'
    calls = []
    responses = []
    firehoseSender = vi.spyOn(firehoseProvider, 'putFirehoseRecordBatch')
    firehoseSender.mockImplementation((input: PutRecordBatchCommandInput) => {
      calls.push(input)
      const response = responses.shift()
      if (response instanceof Error) return Promise.reject(response)
      return Promise.resolve(response ?? makeFirehoseOutput())
    })
    await flush()
  })

  afterEach(async () => {
    try {
      await flush()
    } finally {
      firehoseSender.mockRestore()
    }
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
    const events: string[] = []
    const firstSendStarted = Promise.withResolvers<void>()
    const firstSendReleased = Promise.withResolvers<PutRecordBatchCommandOutput>()
    firehoseSender.mockImplementation(input => {
      calls.push(input)
      firstSendStarted.resolve()
      return firstSendReleased.promise.then(output => {
        events.push('send finished')
        return output
      })
    })

    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'first' }))
    const firstFlushPromise = flush()
    await firstSendStarted.promise
    const concurrentFlushPromise = flush().then(() => {
      events.push('concurrent flush finished')
      return undefined
    })
    firstSendReleased.resolve(makeFirehoseOutput())
    await Promise.all([firstFlushPromise, concurrentFlushPromise])

    expect(events).toEqual(['send finished', 'concurrent flush finished'])
    expect(calls).toHaveLength(1)
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
