import onError from '@modules/on-error'
import {
  cleanupMonthlyPartitions,
  createMonthlyPartitions as createPlatformMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import {
  ALL_MONTHLY_PARTITION_TABLES,
  MONTHLY_PARTITION_RETENTION_TABLES,
} from '../config-driven/utils/partition-config.mts'
import { beginTransaction, write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { beforeRetireMonthlyPartition } from './before-retire-monthly-partition.mts'

export async function createMonthlyPartitions(writer: QueryExecutor = write): Promise<void> {
  await createPlatformMonthlyPartitions(writer, { tables: ALL_MONTHLY_PARTITION_TABLES })
}

export async function cleanupPartitions(referenceDate: Date = new Date()): Promise<void> {
  await cleanupMonthlyPartitions({
    query: write,
    tables: MONTHLY_PARTITION_RETENTION_TABLES,
    referenceDate,
    startTransaction: beginTransaction,
    reportError: onError,
    beforeDetach: beforeRetireMonthlyPartition,
  })
}
