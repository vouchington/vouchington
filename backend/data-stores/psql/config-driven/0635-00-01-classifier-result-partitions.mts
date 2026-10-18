import { CLASSIFIER_RESULT_PARTITION_TABLES } from './utils/partition-config.mts'
import { generateDefaultPartitions } from '@vouchington/postgres/partitions'

/** @public loaded by path by the config-driven migration runner */
export default function createClassifierResultPartitions(): string {
  return generateDefaultPartitions(CLASSIFIER_RESULT_PARTITION_TABLES)
}
