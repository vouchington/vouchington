import { createHash } from 'node:crypto'
import { write, type QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getActiveClassifierConfigurationBySlugFromPrimary } from '@services/classifiers'
import { getStoryClusteringClassifierSystemUserId } from '@services/users/system-users'
import type { ClassifierModelProvider } from '@voucha/types'
import { STORY_CLUSTERING_CLASSIFIER_SLUG } from '@voucha/types/entities/story-clustering-classifier'
import sql from 'sql-template-strings'

/**
 * The replay identity of a story-clustering run's configuration: which prompt, model and actor
 * answer it. The prompt version also fixes the thresholds, and the candidate set is deliberately
 * absent (it is captured once per receipt), so a different embedding search result can never mint a
 * second receipt, and a second provider call, for the same content.
 */
export type StoryClusteringRunConfiguration = {
  revision: 1
  actorId: string
  classifierId: string
  promptVersionId: string
  prompt: string
  modelName: string
  modelProvider: ClassifierModelProvider
}

/**
 * A missing or misconfigured classifier or system actor throws, so the subject stays eligible for
 * the sweep instead of settling as no work, and classifier configuration never silently drops items.
 */
export async function resolveStoryClusteringRunConfiguration(
  query: QueryExecutor = write,
): Promise<ResolvedClassifierRun<StoryClusteringRunConfiguration>> {
  const classifier = await getActiveClassifierConfigurationBySlugFromPrimary(
    STORY_CLUSTERING_CLASSIFIER_SLUG,
    query,
  )
  if (!classifier) {
    throw new Error(
      `Classifier configuration for slug '${STORY_CLUSTERING_CLASSIFIER_SLUG}' not found`,
    )
  }
  if (classifier.primitive !== 'choice' || classifier.candidateKind !== 'story') {
    throw new Error(
      `Classifier '${STORY_CLUSTERING_CLASSIFIER_SLUG}' must be a story Choice classifier`,
    )
  }
  const actorId = await getStoryClusteringClassifierSystemUserId()
  const configuration: StoryClusteringRunConfiguration = {
    revision: 1,
    actorId,
    classifierId: classifier.classifierId,
    promptVersionId: classifier.promptVersionId,
    prompt: classifier.prompt,
    modelName: classifier.modelName,
    modelProvider: classifier.modelProvider,
  }
  const { rows } = await query<{ configuration_json: string }>(sql`
    /* canonicalizeStoryClusteringRunConfiguration */
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
      candidateKind: 'story',
    },
  }
}
