/**
 * Creates monthly range partitions for agentic conversation debugging tables.
 * Retention is handled by dropping expired monthly partitions, not row deletes.
 */

import { generateMonthlyPartitions } from './utils/partition-utils.mts'
import { CONVERSATION_PARTITION_TABLES } from './utils/partition-config.mts'

/** @public loaded by path by the config-driven migration runner */
export default function createConversationPartitions(): string {
  return generateMonthlyPartitions({
    tables: CONVERSATION_PARTITION_TABLES,
  })
}
