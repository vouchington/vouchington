/**
 * Creates partitions for revision tables:
 * - post_revisions: DEFAULT partition
 * - topic_revisions: monthly children for finite history retention
 */

import {
  generateDefaultPartitions,
  generateMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import {
  REVISION_PARTITION_TABLES,
  TOPIC_REVISION_PARTITION_TABLES,
} from './utils/partition-config.mts'

/** loaded by path by the config-driven migration runner */
export default function createRevisionPartitions(): string {
  return [
    generateDefaultPartitions(REVISION_PARTITION_TABLES),
    generateMonthlyPartitions({ tables: TOPIC_REVISION_PARTITION_TABLES }),
  ].join('\n')
}
