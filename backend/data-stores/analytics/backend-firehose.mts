import { createFirehoseBatcher } from '@vouchington/aws/firehose'
import onError from '@modules/on-error'
import { putFirehoseRecordBatch } from '@modules/aws/firehose'
import { getAnalyticsFirehoseStreamName } from './config.mts'
import type { AnalyticsTableName, AnalyticsTableRegistry } from './tables.mts'

const batcher = createFirehoseBatcher({
  // Resolve the provider per call so tests can observe each batch.
  putRecordBatch: input => putFirehoseRecordBatch(input),
  onError: error => {
    if (process.env.NODE_ENV === 'test') {
      Object.assign(error, { tags: { suppressLogging: true } })
    }
    onError(error)
  },
})

export function writeRecord<T extends AnalyticsTableName>(
  table: T,
  record: AnalyticsTableRegistry[T],
): void {
  batcher.writeJson(getAnalyticsFirehoseStreamName(table), record)
}

export function flush(): Promise<void> {
  return batcher.flush()
}
