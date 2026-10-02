import { createHash } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import type { ResolvedClassifierRun } from '@services/classifier-runs'
import { getActiveClassifierConfigurationBySlugFromPrimary } from '@services/classifiers'
import type { ClassifierModelProvider } from '@voucha/types'
import sql from 'sql-template-strings'

/**
 * The replay identity of a topic classifier run's configuration: which prompt, model and actor
 * answer it. Tier caps and the candidate set are deliberately absent, so a plan change or a
 * different candidate search result can never mint a second receipt (and a second provider call)
 * for the same content.
 */
export type TopicClassifierRunConfiguration = {
  revision: 1
  actorId: string
  classifierId: string
  promptVersionId: string
  prompt: string
  modelName: string
  modelProvider: ClassifierModelProvider
}

/**
 * Resolves a seeded global topic classifier into a run configuration that captures its own
 * candidates. A missing seeded classifier or system actor throws, so the subject stays eligible for
 * the sweep and classifier configuration never blocks or delays approval.
 */
export async function resolveTopicClassifierRunConfiguration(
  input: { slug: string; getActorId: () => Promise<string> },
  query: QueryExecutor,
): Promise<ResolvedClassifierRun<TopicClassifierRunConfiguration>> {
  const classifier = await getActiveClassifierConfigurationBySlugFromPrimary(input.slug, query)
  if (!classifier) throw new Error(`Classifier configuration for slug '${input.slug}' not found`)
  const actorId = await input.getActorId()
  const configuration: TopicClassifierRunConfiguration = {
    revision: 1,
    actorId,
    classifierId: classifier.classifierId,
    promptVersionId: classifier.promptVersionId,
    prompt: classifier.prompt,
    modelName: classifier.modelName,
    modelProvider: classifier.modelProvider,
  }
  const { rows } = await query<{ configuration_json: string }>(sql`
    /* canonicalizeTopicClassifierRunConfiguration */
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
