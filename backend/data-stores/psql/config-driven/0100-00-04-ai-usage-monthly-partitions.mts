import { generateMonthlyPartitions } from '@vouchington/postgres/partitions'
import { AI_USAGE_PARTITION_TABLES } from './utils/partition-config.mts'

/** Fresh bootstrap creates explicit UUIDv7 month ranges for raw AI usage. */
export default function createAiUsageMonthlyPartitions(): string {
  return generateMonthlyPartitions({ tables: AI_USAGE_PARTITION_TABLES })
}
