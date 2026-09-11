/**
 * Creates a default partition for posts
 * and related tables. Add explicit range partitions when tables grow large.
 */

import { generateDefaultPartitions } from './utils/partition-utils.mts'
import { POST_PARTITION_TABLES } from './utils/partition-config.mts'

/** @internal */
export default function createPostPartitions(): string {
  return generateDefaultPartitions(POST_PARTITION_TABLES)
}
