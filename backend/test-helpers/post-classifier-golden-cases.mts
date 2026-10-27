import { randomUUID } from 'node:crypto'
import { POST_CLASSIFIER_LABELS } from '@voucha/types/entities/post-classifier'
import {
  classifierGoldenBatchId,
  type ClassifierGoldenCase,
  type ClassifierGoldenFixture,
} from './classifier-golden-set.mts'

/**
 * Golden cases that run `fixtures` through the production post-classifier prompt, bindings and
 * threshold snapshot of a freshly enabled community. Needs the test database; the provider is not
 * called until a case decides.
 */
export async function buildPostClassifierGoldenCases(
  fixtures: readonly ClassifierGoldenFixture[],
): Promise<ClassifierGoldenCase[]> {
  const [
    { buildPostClassifierInput },
    { resolvePostClassifierConfiguration },
    { prepareSingleCallClassifierDecision },
    { createRandomString },
    { createTestUser },
    { insertTestCommunity },
    { setPostClassifierToggleForTest },
  ] = await Promise.all([
    import('../agents/post-classifier/classifier-input.mts'),
    import('../services/post-classifier/configuration.mts'),
    import('../agents/classifiers/prepare-single-call.mts'),
    import('./data.mts'),
    import('./entities/users.mts'),
    import('./entities/communities.mts'),
    import('./entities/post-classifier-toggles.mts'),
  ])
  const owner = await createTestUser()
  const community = await insertTestCommunity({
    createdById: owner.id,
    slug: `classifier-golden-${createRandomString(8)}`,
  })
  const enabledRemoteLabels = POST_CLASSIFIER_LABELS.filter(label => label.kind === 'remote')
  await Promise.all(
    enabledRemoteLabels.map(label =>
      setPostClassifierToggleForTest(community.id, label.slug, true),
    ),
  )
  const resolved = await resolvePostClassifierConfiguration(community.id, {
    detectorPackageVersion: 'classifier-golden-set',
  })
  const remote = resolved?.configuration.remote
  if (!remote) throw new Error('The post classifier has no active remote configuration.')

  return Promise.all(
    fixtures.map(async fixture => {
      const input = await buildPostClassifierInput(
        {
          id: randomUUID(),
          title: 'Synthetic post classifier regression fixture',
          markdown: fixture.state,
        },
        resolved.configuration,
      )
      if (!input) throw new Error(`Fixture ${fixture.id} unexpectedly has no remote input.`)
      return {
        fixture,
        decide: async client => {
          const prepared = await prepareSingleCallClassifierDecision({
            ...input,
            batchId: classifierGoldenBatchId(),
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
          remote.questions.map(question => [
            question.topicId,
            {
              key: question.topicSlug,
              thresholdRevision: question.thresholdId,
              thresholds: { lower: question.lower, upper: question.upper },
            },
          ]),
        ),
      }
    }),
  )
}
