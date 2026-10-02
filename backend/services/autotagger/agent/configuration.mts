import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getAutotaggerAgentSystemUserId } from '@services/users/system-users'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { getAutotaggerPaidLimitsFields } from '../limits-config.mts'
import {
  resolveTopicClassifierRunConfiguration,
  type TopicClassifierRunConfiguration,
} from '../topic-run-configuration.mts'

/**
 * The replay identity of a reasoning autotagger run's configuration. It names the agent's own
 * seeded classifier, prompt version, model and actor, so it is independent of the first stage's:
 * changing either one's prompt never mints a receipt, or a provider call, for the other.
 */
export type AutotaggerAgentRunConfiguration = TopicClassifierRunConfiguration

/**
 * Null only when the operator kill switch (shared with the first stage) is off, which is a
 * deliberate "no work". A missing seeded classifier or system actor throws instead, so the subject
 * stays eligible for the sweep.
 */
export async function resolveAutotaggerAgentRunConfiguration(
  query: QueryExecutor = write,
): Promise<ResolvedClassifierRun<AutotaggerAgentRunConfiguration> | null> {
  if (!getAutotaggerPaidLimitsFields().enabled) return null
  return resolveTopicClassifierRunConfiguration(
    { slug: AUTOTAGGER_AGENT_SLUG, getActorId: getAutotaggerAgentSystemUserId },
    query,
  )
}
