/**
 * Creates default partitions for the deferred-RANGE growth ledgers.
 */

import { generateDefaultPartitions } from '@vouchington/postgres/partitions'
import { DEFERRED_LEDGER_PARTITION_TABLES } from './utils/partition-config.mts'

/** loaded by path by the config-driven migration runner */
export default function createLedgerPartitions(): string {
  return generateDefaultPartitions(DEFERRED_LEDGER_PARTITION_TABLES)
}
