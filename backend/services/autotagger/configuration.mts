import { createHash } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getActiveClassifierConfigurationBySlugFromPrimary } from '@services/classifiers'
import { getAutotaggerClassifierSystemUserId } from '@services/users/system-users'
import type { ClassifierModelProvider } from '@voucha/types'
import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import sql from 'sql-template-strings'
import { getAutotaggerPaidLimitsFields } from './limits-config.mts'

/**
 * The replay identity of a C6 run's configuration: which prompt, model and actor answer it. Tier
 * caps and the candidate set are deliberately absent, so a plan change or a different embedding
 * search result can never mint a second receipt (and a second provider call) for the same content.
 */
export type AutotaggerRunConfiguration = {
  revision: 1
  actorId: string
  classifierId: string
  promptVersionId: string
  prompt: string
  modelName: string
  modelProvider: ClassifierModelProvider
}

/**
 * Null only when the operator kill switch is off, which is a deliberate "no work". A missing seeded
 * classifier or system actor throws instead, so the subject stays eligible for the sweep and
 * classifier configuration never blocks or delays approval.
 */
export async function resolveAutotaggerRunConfiguration(
  query: QueryExecutor = write,
): Promise<ResolvedClassifierRun<AutotaggerRunConfiguration> | null> {
  if (!getAutotaggerPaidLimitsFields().enabled) return null
  const classifier = await getActiveClassifierConfigurationBySlugFromPrimary(
    TAGGING_CLASSIFIER_SLUG,
    query,
  )
  if (!classifier) {
    throw new Error(`Classifier configuration for slug '${TAGGING_CLASSIFIER_SLUG}' not found`)
  }
  const actorId = await getAutotaggerClassifierSystemUserId()
  const configuration: AutotaggerRunConfiguration = {
    revision: 1,
    actorId,
    classifierId: classifier.classifierId,
    promptVersionId: classifier.promptVersionId,
    prompt: classifier.prompt,
    modelName: classifier.modelName,
    modelProvider: classifier.modelProvider,
  }
  const { rows } = await query<{ configuration_json: string }>(sql`
    /* canonicalizeAutotaggerRunConfiguration */
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
      scope: { scopeCategory: 'global', scopeCommunityId: null },
      candidateKind: 'topic',
      capturedCandidates: true,
      candidates: [],
    },
  }
}
