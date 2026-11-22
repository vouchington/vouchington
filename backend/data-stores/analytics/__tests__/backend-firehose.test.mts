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
    vi.useRealTimers()
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

  it('delivers newline-delimited JSON records to the table-specific stream', async () => {
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'event-1' }))

    await flush()

    expect(sent()).toHaveLength(1)
    const input = sent()[0]!
    expect(input.DeliveryStreamName).toBe(`${ANALYTICS_TEST_FIREHOSE_PREFIX}queue_workers`)
    const payload = decodeRecord(input)
    expect(payload.endsWith('\n')).toBe(true)
    expect(JSON.parse(payload)).toMatchObject({
      event_id: 'event-1',
      queue: 'psql',
      event: 'active',
    })
    await expect(firehoseSender.mock.results[0]?.value).resolves.toMatchObject({
      FailedPutCount: 0,
    })
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof emit)
  void (0 as unknown as typeof onGracefulShutdown)
  void (0 as unknown as typeof writeLocalRecord)
})
