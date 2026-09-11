/**
 * Creates default partitions for the deferred-RANGE growth ledgers.
 */

import { generateDefaultPartitions } from './utils/partition-utils.mts'
import { DEFERRED_LEDGER_PARTITION_TABLES } from './utils/partition-config.mts'

export default function createLedgerPartitions(): string {
  return generateDefaultPartitions(DEFERRED_LEDGER_PARTITION_TABLES)
}
