/**
 * Creates default RANGE partitions for publication receipts and retained work keys.
 */

import { POST_PUBLICATION_PARTITION_TABLES } from './utils/partition-config.mts'
import { generateDefaultPartitions } from './utils/partition-utils.mts'

/** @public loaded by path by the config-driven migration runner */
export default function createPostPublicationPartitions(): string {
  return generateDefaultPartitions(POST_PUBLICATION_PARTITION_TABLES)
}
