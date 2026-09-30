/**
 * Creates default partitions for tables ranged by a UUIDv7 user or parent key.
 */

import { USER_KEY_PARTITION_TABLES } from './utils/partition-config.mts'
import { generateDefaultPartitions } from './utils/partition-utils.mts'

/** @public loaded by path by the config-driven migration runner */
export default function createUserKeyPartitions(): string {
  return generateDefaultPartitions(USER_KEY_PARTITION_TABLES)
}
