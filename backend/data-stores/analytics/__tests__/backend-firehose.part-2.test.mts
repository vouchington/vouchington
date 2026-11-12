import fs from 'node:fs'

import os from 'node:os'

import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import type { PutRecordBatchCommandInput, PutRecordBatchCommandOutput } from '@modules/aws/firehose'
import * as firehoseProvider from '@modules/aws/firehose'

import { emit } from '../emit.mts'

import { onGracefulShutdown } from '../graceful-shutdown.mts'

import { writeRecord as writeLocalRecord } from '../backend-local.mts'
import { ANALYTICS_TEST_FIREHOSE_PREFIX } from '../../../test-helpers/aws-emulator-firehose.mts'
import { flush, writeRecord } from '../backend-firehose.mts'
type PutBatch = (input: PutRecordBatchCommandInput) => Promise<PutRecordBatchCommandOutput>

describe('backend-firehose', () => {
  const originalBackend = process.env.ANALYTICS_BACKEND

  const originalLocalDir = process.env.ANALYTICS_LOCAL_DIR

  const originalPrefix = process.env.ANALYTICS_FIREHOSE_PREFIX

  // Observes each batch the writer sends. Every call still reaches the AWS Emulator's real
  // delivery streams (provisioned by global setup), so request shape and acceptance are real.
  let firehoseSender: MockInstance<PutBatch>

  const sent = () => firehoseSender.mock.calls.map(([input]) => input)

  beforeEach(async () => {
    process.env.ANALYTICS_FIREHOSE_PREFIX = ANALYTICS_TEST_FIREHOSE_PREFIX
    await flush()
    firehoseSender = vi.spyOn(firehoseProvider, 'putFirehoseRecordBatch')
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
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'first' }))
    const firstFlushPromise = flush()
    // The first request is on the wire; note when its real response arrives.
    void Promise.resolve(firehoseSender.mock.results[0]?.value).then(() =>
      events.push('send finished'),
    )
    const concurrentFlushPromise = flush().then(() => {
      events.push('concurrent flush finished')
      return undefined
    })
    await Promise.all([firstFlushPromise, concurrentFlushPromise])

    expect(events).toEqual(['send finished', 'concurrent flush finished'])
    expect(sent()).toHaveLength(1)
  })

  it('writes Firehose records through emit()', async () => {
    process.env.ANALYTICS_BACKEND = 'firehose'

    emit('queue_workers', makeQueueWorkerRecord({ event_id: 'emit' }))
    await flush()

    expect(sent()).toHaveLength(1)
    expect(JSON.parse(decodeRecord(sent()[0]!))).toMatchObject({ event_id: 'emit' })
    await expect(firehoseSender.mock.results[0]?.value).resolves.toMatchObject({
      FailedPutCount: 0,
    })
  })

  it('flushes Firehose records on graceful shutdown', async () => {
    process.env.ANALYTICS_BACKEND = 'firehose'
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'shutdown-firehose' }))

    await onGracefulShutdown()

    expect(sent()).toHaveLength(1)
    expect(JSON.parse(decodeRecord(sent()[0]!))).toMatchObject({
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
