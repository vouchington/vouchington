import { randomUUID } from 'node:crypto'
import {
  classifierGoldenBatchId,
  type ClassifierGoldenCase,
  type ClassifierGoldenFixture,
} from './classifier-golden-set.mts'

/**
 * Golden cases that run `fixtures` through the production autotagger prompt and bindings of the
 * active tagging classifier. Needs the test database; the provider is not called until a case
 * decides.
 */
export async function buildAutotaggerGoldenCases(
  fixtures: readonly ClassifierGoldenFixture[],
): Promise<ClassifierGoldenCase[]> {
  const [
    { buildPostClassifierState, buildRssFeedItemClassifierState },
    { getActiveClassifierConfigurationBySlugFromPrimary },
    { prepareSingleCallClassifierDecision },
    { buildAutotaggerBindings },
  ] = await Promise.all([
    import('../agents/autotagger/content.mts'),
    import('../services/classifiers/index.mts'),
    import('../agents/classifiers/prepare-single-call.mts'),
    import('../agents/autotagger/classifier-run-bindings.mts'),
  ])
  const configuration = await getActiveClassifierConfigurationBySlugFromPrimary('tagging')
  if (configuration?.modelProvider !== 'openrouter') {
    throw new Error('The tagging classifier must have an active OpenRouter configuration.')
  }

  return Promise.all(
    fixtures.map(async fixture => {
      if (typeof fixture.candidateSlate === 'string') {
        throw new Error(`Fixture ${fixture.id} must declare its synthetic candidate slate.`)
      }
      const state =
        fixture.subjectKind === 'post'
          ? await buildPostClassifierState({
              title: 'Synthetic autotagger regression fixture',
              markdown: fixture.state,
            } as Parameters<typeof buildPostClassifierState>[0])
          : await buildRssFeedItemClassifierState({
              data: {
                title: 'Synthetic airport lounge review',
                content: fixture.state,
              },
            } as Parameters<typeof buildRssFeedItemClassifierState>[0])
      const subject =
        fixture.subjectKind === 'post'
          ? { postId: randomUUID(), rssFeedItemId: null }
          : { postId: null, rssFeedItemId: randomUUID() }
      const candidates = fixture.candidateSlate.map(name => ({ topicId: randomUUID(), name }))
      const bindings = await buildAutotaggerBindings(configuration.prompt, candidates)
      return {
        fixture,
        decide: async client => {
          const prepared = await prepareSingleCallClassifierDecision({
            batchId: classifierGoldenBatchId(),
            classifierId: configuration.classifierId,
            promptVersionId: configuration.promptVersionId,
            subject,
            scope: { scopeCategory: 'global', scopeCommunityId: null },
            state,
            bindings,
            client,
          })
          return prepared.calls.flatMap(call =>
            call.results.flatMap(result =>
              result.candidateKind === 'topic'
                ? [{ candidateId: result.topicId, probability: result.probability }]
                : [],
            ),
          )
        },
        candidates: Object.fromEntries(
          candidates.map(candidate => [
            candidate.topicId,
            {
              key: candidate.name,
              thresholdRevision: `defaults@${configuration.promptVersionId}`,
              thresholds: configuration.defaultThresholds,
            },
          ]),
        ),
      }
    }),
  )
}
