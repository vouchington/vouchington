import { randomUUID } from 'node:crypto'

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

  const FIREHOSE_RECORD_BYTES = 1000 * 1024
  const FIREHOSE_BATCH_BYTES = 4 * 1024 * 1024

  function encodedBytes(eventId: string, payload: string): number {
    return Buffer.byteLength(
      `${JSON.stringify({ ...makeQueueWorkerRecord({ event_id: eventId }), payload })}\n`,
    )
  }

  function payloadOfEncodedSize(eventId: string, encodedSize: number): string {
    return 'x'.repeat(encodedSize - encodedBytes(eventId, ''))
  }

  // A response the emulator cannot produce: a per-record failure inside a successful batch.
  const partialFailure = {
    $metadata: {},
    FailedPutCount: 1,
    RequestResponses: [{ RecordId: 'ok' }, { ErrorCode: 'ServiceUnavailable' }],
  } satisfies PutRecordBatchCommandOutput

  it('flushes records on the timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'timer' }))

    await vi.advanceTimersByTimeAsync(1_100)

    expect(sent()).toHaveLength(1)
    expect(JSON.parse(decodeRecord(sent()[0]!))).toMatchObject({ event_id: 'timer' })
  })

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

  it('splits batches at the 500-record Firehose limit', async () => {
    for (let index = 0; index < 501; index += 1) {
      writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: `event-${index}` }))
    }

    await flush()

    expect(sent()).toHaveLength(2)
    expect(sent()[0]!.Records).toHaveLength(500)
    expect(sent()[1]!.Records).toHaveLength(1)
  })

  it('splits batches at the Firehose byte limit', async () => {
    for (let index = 0; index < 5; index += 1) {
      const record = {
        ...makeQueueWorkerRecord({ event_id: `large-${index}` }),
        payload: payloadOfEncodedSize(`large-${index}`, Math.floor(FIREHOSE_BATCH_BYTES / 5) + 1),
      }
      writeRecord('queue_workers', record)
    }

    await flush()

    expect(sent()).toHaveLength(2)
  })

  it('drops records that exceed the Firehose record limit', async () => {
    const record = {
      ...makeQueueWorkerRecord({ event_id: 'oversized' }),
      payload: payloadOfEncodedSize('oversized', FIREHOSE_RECORD_BYTES + 1),
    }

    writeRecord('queue_workers', record)
    await flush()

    expect(sent()).toHaveLength(0)
  })

  it('retries only failed records once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Only the first response is injected; the retry reaches the real stream.
    firehoseSender.mockResolvedValueOnce(partialFailure)
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'ok' }))
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'retry' }))

    const flushPromise = flush()
    await vi.advanceTimersByTimeAsync(99)
    expect(sent()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromise

    expect(sent()).toHaveLength(2)
    expect(sent()[1]!.Records).toHaveLength(1)
    expect(JSON.parse(decodeRecord(sent()[1]!))).toMatchObject({ event_id: 'retry' })
    await expect(firehoseSender.mock.results[1]?.value).resolves.toMatchObject({
      FailedPutCount: 0,
    })
  })

  it('retries request errors once before dropping the batch', async () => {
    // A stream that does not exist makes the emulator reject every request.
    process.env.ANALYTICS_FIREHOSE_PREFIX = `missing-${randomUUID()}-`
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'event-1' }))

    await flush()

    expect(sent()).toHaveLength(2)
    await expect(firehoseSender.mock.results[0]?.value).rejects.toMatchObject({
      name: 'ResourceNotFoundException',
    })
  })

  it('drains records added while a flush is in progress', async () => {
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'first' }))
    const flushPromise = flush()
    // The first request is on the wire, so this record lands in the buffer of an active flush.
    writeRecord('queue_workers', makeQueueWorkerRecord({ event_id: 'second' }))
    await flushPromise

    expect(sent()).toHaveLength(2)
    expect(JSON.parse(decodeRecord(sent()[1]!))).toMatchObject({ event_id: 'second' })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof emit)
  void (0 as unknown as typeof onGracefulShutdown)
  void (0 as unknown as typeof writeLocalRecord)
})
