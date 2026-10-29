/**
 * Creates partitions for revision tables:
 * - post_revisions: monthly children for finite history retention
 * - topic_revisions: monthly children for finite history retention
 */

import { generateMonthlyPartitions } from '@vouchington/postgres/partitions'
import {
  POST_REVISION_PARTITION_TABLES,
  TOPIC_REVISION_PARTITION_TABLES,
} from './utils/partition-config.mts'

/** loaded by path by the config-driven migration runner */
export default function createRevisionPartitions(): string {
  return [
    generateMonthlyPartitions({ tables: POST_REVISION_PARTITION_TABLES }),
    generateMonthlyPartitions({ tables: TOPIC_REVISION_PARTITION_TABLES }),
  ].join('\n')
}
