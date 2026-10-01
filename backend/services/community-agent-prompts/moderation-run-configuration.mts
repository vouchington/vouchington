import { createHash } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getActiveClassifierConfigurationBySlugFromPrimary } from '@services/classifiers'
import { getModerationSystemUserId } from '@services/users/system-users'
import type { ClassifierModelProvider } from '@voucha/types'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import sql from 'sql-template-strings'
import { getActiveCommunityAgentPrompts } from './get-active-prompts.mts'

/** Per-call bounds of the single-call path: a fail-safe, not a product limit; slot caps are unchanged. */
export const MAX_COMMUNITY_MODERATION_QUESTIONS = 30
export const MAX_COMMUNITY_MODERATION_RULE_CHARACTERS = 40_000

export type CommunityModerationPrompt = { id: string; text: string }

/**
 * The replay identity of one community moderation run: which classifier prompt, model and actor
 * ask which of the community's rules. It is exactly what the single provider call asks, so a rule
 * edit, activation or deactivation re-keys the run while unchanged content under an unchanged
 * configuration is never classified again. The community action (`automod_action`) is deliberately
 * absent: it is read when effects are applied, so changing it never re-bills.
 */
export type CommunityModerationRunConfiguration = {
  revision: 1
  actorId: string
  communityId: string
  classifierId: string
  promptVersionId: string
  prompt: string
  modelName: string
  modelProvider: ClassifierModelProvider
  prompts: readonly CommunityModerationPrompt[]
}

/**
 * Keeps the longest prefix of the prompts, in the order given, that fits the per-call caps, so
 * what is pinned is exactly what is asked. Prompts past a cap are not sent. Sorted by id so the
 * configuration is deterministic whatever order activation gave them.
 */
export function selectCommunityModerationPrompts(
  prompts: readonly CommunityModerationPrompt[],
): CommunityModerationPrompt[] {
  const selected: CommunityModerationPrompt[] = []
  let ruleCharacters = 0
  for (const prompt of prompts) {
    ruleCharacters += prompt.text.length
    if (
      selected.length === MAX_COMMUNITY_MODERATION_QUESTIONS ||
      ruleCharacters > MAX_COMMUNITY_MODERATION_RULE_CHARACTERS
    ) {
      break
    }
    selected.push({ id: prompt.id, text: prompt.text })
  }
  return selected.toSorted((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
}

/**
 * Null when the community has no active prompt, which is a deliberate "no work". A missing seeded
 * classifier or system actor throws instead, so the post stays eligible for the sweep and
 * classifier configuration never blocks publication.
 */
export async function resolveCommunityModerationRunConfiguration(
  communityId: string,
  query: QueryExecutor = write,
): Promise<ResolvedClassifierRun<CommunityModerationRunConfiguration> | null> {
  const prompts = selectCommunityModerationPrompts(
    (await getActiveCommunityAgentPrompts(communityId, query)).map(row => ({
      id: row.id,
      text: row.prompt,
    })),
  )
  if (prompts.length === 0) return null
  const classifier = await getActiveClassifierConfigurationBySlugFromPrimary(
    COMMUNITY_MODERATION_CLASSIFIER_SLUG,
    query,
  )
  if (!classifier) {
    throw new Error(
      `Classifier configuration for slug '${COMMUNITY_MODERATION_CLASSIFIER_SLUG}' not found`,
    )
  }
  if (classifier.candidateKind !== 'community_prompt') {
    throw new Error('Community moderation classifier must use community prompt candidates')
  }
  const actorId = await getModerationSystemUserId()
  const configuration: CommunityModerationRunConfiguration = {
    revision: 1,
    actorId,
    communityId,
    classifierId: classifier.classifierId,
    promptVersionId: classifier.promptVersionId,
    prompt: classifier.prompt,
    modelName: classifier.modelName,
    modelProvider: classifier.modelProvider,
    prompts,
  }
  const { rows } = await query<{ configuration_json: string }>(sql`
    /* canonicalizeCommunityModerationRunConfiguration */
    SELECT ${JSON.stringify(configuration)}::jsonb::text AS configuration_json
  `)
  const configurationJson = rows[0]!.configuration_json
  return {
    configuration,
    configurationJson,
    configurationSha256: createHash('sha256').update(configurationJson).digest(),
    actorId,
    remote: {
      classifierId: configuration.classifierId,
      promptVersionId: configuration.promptVersionId,
      scope: { scopeCategory: 'community_ai', scopeCommunityId: communityId },
      candidateKind: 'community_prompt',
      promptIds: prompts.map(prompt => prompt.id),
    },
  }
}
