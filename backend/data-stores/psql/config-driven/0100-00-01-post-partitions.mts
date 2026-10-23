/**
 * Creates a default partition for posts
 * and related tables. Add explicit range partitions when tables grow large.
 */

import { generateDefaultPartitions } from '@vouchington/postgres/partitions'
import { POST_PARTITION_TABLES } from './utils/partition-config.mts'

/** loaded by path by the config-driven migration runner */
export default function createPostPartitions(): string {
  return generateDefaultPartitions(POST_PARTITION_TABLES)
}
