import { generateMonthlyPartitions } from '@vouchington/postgres/partitions'
import { COPYRIGHT_HISTORY_PARTITION_TABLES } from './utils/partition-config.mts'

/** Initial bootstrap creates actual monthly children before legal history is admitted. */
export default function createCopyrightHistoryPartitions(): string {
  return generateMonthlyPartitions({ tables: COPYRIGHT_HISTORY_PARTITION_TABLES })
}
