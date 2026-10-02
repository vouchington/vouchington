import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getAutotaggerClassifierSystemUserId } from '@services/users/system-users'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import { getAutotaggerPaidLimitsFields } from './limits-config.mts'
import {
  resolveTopicClassifierRunConfiguration,
  type TopicClassifierRunConfiguration,
} from './topic-run-configuration.mts'

/** The replay identity of a C6 run's configuration (see `TopicClassifierRunConfiguration`). */
export type AutotaggerRunConfiguration = TopicClassifierRunConfiguration

/**
 * Null only when the operator kill switch is off, which is a deliberate "no work". A missing seeded
 * classifier or system actor throws instead, so the subject stays eligible for the sweep and
 * classifier configuration never blocks or delays approval.
 */
export async function resolveAutotaggerRunConfiguration(
  query: QueryExecutor = write,
): Promise<ResolvedClassifierRun<AutotaggerRunConfiguration> | null> {
  if (!getAutotaggerPaidLimitsFields().enabled) return null
  return resolveTopicClassifierRunConfiguration(
    { slug: TAGGING_CLASSIFIER_SLUG, getActorId: getAutotaggerClassifierSystemUserId },
    query,
  )
}
