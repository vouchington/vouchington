import path from 'node:path'
import {
  createJsonlPartitionWriter,
  type JsonlPartitionWriter,
} from '@vouchington/server-utils/jsonl-partition-writer'
import onError from '@modules/on-error'
import { getAnalyticsLocalDir } from './query-files.mts'
import type { AnalyticsTableName, AnalyticsTableRegistry } from './tables.mts'

interface BufferedAnalyticsRecord {
  table: AnalyticsTableName
  record: AnalyticsTableRegistry[AnalyticsTableName]
  toJSON(): AnalyticsTableRegistry[AnalyticsTableName]
}

const writers = new Map<string, JsonlPartitionWriter<BufferedAnalyticsRecord>>()

function getWriter(directory: string): JsonlPartitionWriter<BufferedAnalyticsRecord> {
  let writer = writers.get(directory)
  if (!writer) {
    writer = createJsonlPartitionWriter<BufferedAnalyticsRecord>({
      directory,
      partition: entry => path.join(entry.table, `${entry.record.event_date}.jsonl`),
      onError: error => {
        onError(error instanceof Error ? error : new Error(String(error), { cause: error }))
      },
    })
    writers.set(directory, writer)
  }
  return writer
}

/** Returns the partition path for the given table and date string (YYYY-MM-DD). */
export function getPartitionPath(table: AnalyticsTableName, eventDate: string): string {
  return path.join(getAnalyticsLocalDir(), table, `${eventDate}.jsonl`)
}

export function writeRecord<T extends AnalyticsTableName>(
  table: T,
  record: AnalyticsTableRegistry[T],
): void {
  getWriter(getAnalyticsLocalDir()).write({
    table,
    record,
    toJSON() {
      return this.record
    },
  })
}

export async function flush(): Promise<void> {
  if (writers.size === 0) return
  const entries = [...writers.entries()]
  const results = await Promise.allSettled(entries.map(([, writer]) => writer.flush()))
  const currentDir = getAnalyticsLocalDir()
  for (const [directory] of entries) {
    if (directory !== currentDir) writers.delete(directory)
  }
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}
