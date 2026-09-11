/**
 * Creates default RANGE partitions for publication receipts and retained work keys.
 */

import { POST_PUBLICATION_PARTITION_TABLES } from './utils/partition-config.mts'
import { generateDefaultPartitions } from './utils/partition-utils.mts'

export default function createPostPublicationPartitions(): string {
  return generateDefaultPartitions(POST_PUBLICATION_PARTITION_TABLES)
}
