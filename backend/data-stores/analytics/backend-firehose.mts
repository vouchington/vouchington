/* oxlint-disable eslint/max-lines -- Firehose buffering, batching, retry, and test hooks share one in-process queue. */
import onError from '@modules/on-error'
import {
  putFirehoseRecordBatch,
  type PutRecordBatchCommandInput,
  type PutRecordBatchCommandOutput,
} from '@modules/aws/firehose'
import { getAnalyticsFirehoseStreamName } from './config.mts'
import type { AnalyticsTableName, AnalyticsTableRegistry } from './tables.mts'

const MAX_RECORDS = 500
const MAX_RECORD_BYTES = 1000 * 1024
const MAX_BATCH_BYTES = 4 * 1024 * 1024
const FLUSH_INTERVAL_MS = 1000,
  RETRY_DELAY_MS = 100

interface BufferedRecord {
  streamName: string
  data: Uint8Array
}

const encoder = new TextEncoder()
const buffer: BufferedRecord[] = []
let sendFirehoseRecordBatch: (
  input: PutRecordBatchCommandInput,
) => Promise<PutRecordBatchCommandOutput> = putFirehoseRecordBatch
let bufferedBytes = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
let isFlushing = false
let activeFlushPromise: Promise<void> | null = null
let retryDelayMs = RETRY_DELAY_MS
let waitBeforeRetry = delay

function firehoseError(message: string): Error {
  const error = new Error(message)
  if (process.env.NODE_ENV === 'test') {
    Object.assign(error, { tags: { suppressLogging: true } })
  }
  return error
}

function scheduleFlush() {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush().catch(onError)
  }, FLUSH_INTERVAL_MS)
  flushTimer.unref()
}

export function writeRecord<T extends AnalyticsTableName>(
  table: T,
  record: AnalyticsTableRegistry[T],
): void {
  const data = encoder.encode(`${JSON.stringify(record)}\n`)
  if (data.byteLength > MAX_RECORD_BYTES) {
    onError(firehoseError(`Analytics Firehose record exceeds 1000 KiB limit for table ${table}`))
    return
  }

  buffer.push({ streamName: getAnalyticsFirehoseStreamName(table), data })
  bufferedBytes += data.byteLength

  if (buffer.length >= MAX_RECORDS || bufferedBytes >= MAX_BATCH_BYTES) {
    const timerHandle = flushTimer
    flushTimer = null
    if (timerHandle !== null) clearTimeout(timerHandle)
    flush().catch(onError)
    return
  }

  scheduleFlush()
}

export async function flush(): Promise<void> {
  if (isFlushing) {
    await activeFlushPromise
    if (buffer.length > 0) await flush()
    return
  }
  if (buffer.length === 0) return
  const timerHandle = flushTimer
  flushTimer = null
  if (timerHandle !== null) clearTimeout(timerHandle)
  isFlushing = true
  activeFlushPromise = flushBufferedRecords()

  await activeFlushPromise
}

export function setFirehoseRecordBatchSenderForTest(
  sender: (input: PutRecordBatchCommandInput) => Promise<PutRecordBatchCommandOutput>,
): () => void {
  const previousSender = sendFirehoseRecordBatch
  sendFirehoseRecordBatch = sender
  return () => {
    sendFirehoseRecordBatch = previousSender
  }
}

export function setFirehoseRetryDelayForTest(delayMs: number): () => void {
  const previousDelayMs = retryDelayMs
  retryDelayMs = delayMs
  return () => {
    retryDelayMs = previousDelayMs
  }
}

export function setFirehoseRetryWaitForTest(wait: (delayMs: number) => Promise<void>): () => void {
  const previousWait = waitBeforeRetry
  waitBeforeRetry = wait
  return () => {
    waitBeforeRetry = previousWait
  }
}

async function flushBufferedRecords(): Promise<void> {
  try {
    const records = buffer.splice(0, buffer.length)
    bufferedBytes = 0
    const groups = groupRecords(records)

    await Promise.all(
      Array.from(groups.entries()).flatMap(([streamName, streamRecords]) =>
        splitBatches(streamRecords).map(batch => sendBatch(streamName, batch)),
      ),
    )
  } finally {
    isFlushing = false
    activeFlushPromise = null
  }

  if (buffer.length > 0) {
    await flush()
  }
}

function groupRecords(records: BufferedRecord[]) {
  const groups = new Map<string, BufferedRecord[]>()
  for (const record of records) {
    const group = groups.get(record.streamName)
    if (group) {
      group.push(record)
    } else {
      groups.set(record.streamName, [record])
    }
  }

  return groups
}

function splitBatches(records: BufferedRecord[]) {
  const batches: BufferedRecord[][] = []
  let batch: BufferedRecord[] = []
  let batchBytes = 0

  for (const record of records) {
    if (
      batch.length > 0 &&
      (batch.length >= MAX_RECORDS || batchBytes + record.data.byteLength > MAX_BATCH_BYTES)
    ) {
      batches.push(batch)
      batch = []
      batchBytes = 0
    }

    batch.push(record)
    batchBytes += record.data.byteLength
  }

  if (batch.length > 0) {
    batches.push(batch)
  }

  return batches
}

async function sendBatch(streamName: string, records: BufferedRecord[]): Promise<void> {
  const failedRecords = await sendBatchOnce(streamName, records)
  if (failedRecords.length === 0) return

  await waitBeforeRetry(retryDelayMs)
  const retryFailedRecords = await sendBatchOnce(streamName, failedRecords)
  if (retryFailedRecords.length > 0) {
    onError(
      firehoseError(
        `Dropped ${retryFailedRecords.length} analytics Firehose records for stream ${streamName}`,
      ),
    )
  }
}

async function delay(delayMs: number): Promise<void> {
  if (delayMs <= 0) return
  await new Promise(resolve => setTimeout(resolve, delayMs))
}

async function sendBatchOnce(streamName: string, records: BufferedRecord[]) {
  try {
    const output = await sendFirehoseRecordBatch({
      DeliveryStreamName: streamName,
      Records: records.map(record => ({ Data: record.data })),
    })

    if (!output.FailedPutCount) return []
    return records.filter((_, index) => {
      const response = output.RequestResponses?.[index]
      return Boolean(response?.ErrorCode)
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return records
  }
}
