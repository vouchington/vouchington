/**
 * Creates monthly range partitions for agent_responses table.
 * Retention is handled by dropping expired monthly partitions, not row deletes.
 */

import { generateMonthlyPartitions } from './utils/partition-utils.mts'
import { AGENT_RESPONSE_PARTITION_TABLES } from './utils/partition-config.mts'

export default function createAgentResponsePartitions(): string {
  return generateMonthlyPartitions({
    tables: AGENT_RESPONSE_PARTITION_TABLES,
  })
}
