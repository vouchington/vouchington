import { CLASSIFIER_RESULT_PARTITION_TABLES } from './utils/partition-config.mts'
import { generateDefaultPartitions } from './utils/partition-utils.mts'

/** @public loaded by path by the config-driven migration runner */
export default function createClassifierResultPartitions(): string {
  return generateDefaultPartitions(CLASSIFIER_RESULT_PARTITION_TABLES)
}
