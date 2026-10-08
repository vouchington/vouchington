import { createHash } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getAutotaggerAgentSystemUserId } from '@services/users/system-users'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import sql from 'sql-template-strings'
import { getAutotaggerPaidLimitsFields } from '../limits-config.mts'

/**
 * The replay identity of a reasoning autotagger run's configuration: the agent's own seeded
 * classifier row and actor. It names no prompt, model or threshold: the instructions live in code,
 * and the provider and model come from the `autotagger-agent` entry of the `ai-model-routing`
 * setting when the run executes, so switching either never mints a receipt, or a provider call,
 * for content that already has one.
 */
export type AutotaggerAgentRunConfiguration = {
  revision: 1
  actorId: string
  classifierId: string
}

/**
 * Null only when the operator kill switch (shared with the first stage) is off, which is a
 * deliberate "no work". A missing seeded classifier or system actor throws instead, so the subject
 * stays eligible for the sweep.
 */
export async function resolveAutotaggerAgentRunConfiguration(
  query: QueryExecutor = write,
): Promise<ResolvedClassifierRun<AutotaggerAgentRunConfiguration> | null> {
  if (!getAutotaggerPaidLimitsFields().enabled) return null
  const { rows: classifiers } = await query<{ id: string }>(
    sql`/* resolveAutotaggerAgentClassifier */
    SELECT id FROM classifiers
    WHERE slug = ${AUTOTAGGER_AGENT_SLUG}
      AND activated_at IS NOT NULL AND deactivated_at IS NULL AND deleted_at IS NULL
  `,
  )
  const classifierId = classifiers[0]?.id
  if (!classifierId)
    throw new Error(`Classifier configuration for slug '${AUTOTAGGER_AGENT_SLUG}' not found`)
  const actorId = await getAutotaggerAgentSystemUserId()
  const configuration: AutotaggerAgentRunConfiguration = { revision: 1, actorId, classifierId }
  const { rows } = await query<{ configuration_json: string }>(sql`
    /* canonicalizeAutotaggerAgentRunConfiguration */
    SELECT ${JSON.stringify(configuration)}::jsonb::text AS configuration_json
  `)
  const configurationJson = rows[0]!.configuration_json
  return {
    configuration,
    configurationJson,
    configurationSha256: createHash('sha256').update(configurationJson).digest(),
    actorId,
    remote: null,
    agent: { candidateKind: 'topic' },
  }
}
