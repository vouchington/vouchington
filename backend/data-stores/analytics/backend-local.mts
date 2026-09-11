import fs from 'node:fs'
import path from 'node:path'
import onError from '@modules/on-error'
import type { AnalyticsTableName, AnalyticsTableRegistry } from './tables.mts'

function getLocalDir(): string {
  return process.env.ANALYTICS_LOCAL_DIR ?? './tmp/analytics'
}

const MAX_RECORDS = 500
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
const FLUSH_INTERVAL_MS = 1000

interface BufferedRecord {
  table: AnalyticsTableName
  record: AnalyticsTableRegistry[AnalyticsTableName]
  serialized: string
}

type AppendLocalFile = (filePath: string, data: string) => Promise<void>

const buffer: BufferedRecord[] = []
let bufferedBytes = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
let activeFlushPromise: Promise<void> | null = null
let appendLocalFile: AppendLocalFile = (filePath, data) =>
  fs.promises.appendFile(filePath, data, 'utf8')

function scheduleFlush() {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush().catch(onError)
  }, FLUSH_INTERVAL_MS)
  flushTimer.unref()
}

/** Returns the partition path for the given table and date string (YYYY-MM-DD). */
export function getPartitionPath(table: AnalyticsTableName, eventDate: string): string {
  return path.join(getLocalDir(), table, `${eventDate}.jsonl`)
}

export function writeRecord<T extends AnalyticsTableName>(
  table: T,
  record: AnalyticsTableRegistry[T],
): void {
  const serialized = JSON.stringify(record)
  buffer.push({ table, record, serialized })
  bufferedBytes += serialized.length + 1 // +1 for newline

  if (buffer.length >= MAX_RECORDS || bufferedBytes >= MAX_BYTES) {
    // Flush immediately when thresholds exceeded
    const timerHandle = flushTimer
    flushTimer = null
    if (timerHandle !== null) clearTimeout(timerHandle)
    flush().catch(onError)
    return
  }

  scheduleFlush()
}

export function flush(): Promise<void> {
  if (activeFlushPromise) return activeFlushPromise
  if (buffer.length === 0) return Promise.resolve()
  const timerHandle = flushTimer
  flushTimer = null
  if (timerHandle !== null) clearTimeout(timerHandle)
  activeFlushPromise = Promise.resolve().then(drainBufferedRecords)
  return activeFlushPromise
}

export function setLocalAppendFileForTest(appendFile: AppendLocalFile): () => void {
  const previousAppendLocalFile = appendLocalFile
  appendLocalFile = appendFile
  return () => {
    appendLocalFile = previousAppendLocalFile
  }
}

async function drainBufferedRecords(): Promise<void> {
  let firstError: unknown
  let hasError = false
  while (buffer.length > 0) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each append may add the next batch to this shared drain
      await flushBufferedRecords()
    } catch (error) {
      if (!hasError) firstError = error
      hasError = true
    }
  }
  activeFlushPromise = null
  if (hasError) throw firstError
}

async function flushBufferedRecords(): Promise<void> {
  const records = buffer.splice(0, buffer.length)
  bufferedBytes = 0
  const groups = new Map<string, { table: AnalyticsTableName; date: string; lines: string[] }>()

  for (const item of records) {
    const eventDate = (item.record as { event_date: string }).event_date
    const key = `${item.table}:${eventDate}`
    let group = groups.get(key)
    if (!group) {
      group = { table: item.table, date: eventDate, lines: [] }
      groups.set(key, group)
    }
    group.lines.push(item.serialized)
  }

  await Promise.all(
    Array.from(groups.values()).map(async ({ table, date, lines }) => {
      const filePath = getPartitionPath(table, date)
      const dir = path.dirname(filePath)
      await fs.promises.mkdir(dir, { recursive: true })
      await appendLocalFile(filePath, `${lines.join('\n')}\n`)
    }),
  )
}
