/**
 * Creates partitions for revision tables:
 * - post_revisions: DEFAULT partition (no retention needed)
 * - topic_revisions: not partitioned (small table)
 */

import { generateDefaultPartitions } from './utils/partition-utils.mts'
import { REVISION_PARTITION_TABLES } from './utils/partition-config.mts'

/** @internal */
export default function createRevisionPartitions(): string {
  return generateDefaultPartitions(REVISION_PARTITION_TABLES)
}
