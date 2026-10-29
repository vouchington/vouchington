/**
 * Creates default partitions for deferred-RANGE growth ledgers and monthly children for decision history.
 */

import {
  generateDefaultPartitions,
  generateMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import {
  DEFERRED_LEDGER_PARTITION_TABLES,
  DECISION_HISTORY_PARTITION_TABLES,
} from './utils/partition-config.mts'

/** loaded by path by the config-driven migration runner */
export default function createLedgerPartitions(): string {
  return [
    generateDefaultPartitions(DEFERRED_LEDGER_PARTITION_TABLES),
    generateMonthlyPartitions({ tables: DECISION_HISTORY_PARTITION_TABLES }),
  ].join('\n')
}
