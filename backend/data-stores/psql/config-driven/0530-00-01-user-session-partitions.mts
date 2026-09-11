/**
 * Creates the default RANGE partition for user_sessions.
 *
 * Explicit range partitions are added manually when operational size warrants it.
 */

import { generateDefaultPartitions } from './utils/partition-utils.mts'
import { USER_SESSION_PARTITION_TABLES } from './utils/partition-config.mts'

export default function createUserSessionPartitions(): string {
  return generateDefaultPartitions(USER_SESSION_PARTITION_TABLES)
}
