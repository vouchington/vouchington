import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { POST_CLASSIFIER_LABELS } from '@voucha/types/entities/post-classifier'
import { postClassifierGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import {
  runClassifierGoldenSet,
  classifierGoldenBatchId,
  type ClassifierGoldenCase,
} from '@voucha/test-helpers/classifier-golden-set'

const apiKey = process.env.OPENROUTER_API_KEY ?? ''

describe('post classifier golden regression set', () => {
  it.skipIf(!apiKey)('keeps synthetic post decisions in their configured bands', async () => {
    const [
      { buildPostClassifierInput },
      { resolvePostClassifierConfiguration },
      { prepareSingleCallClassifierDecision },
      { createRandomString },
      { createTestUser },
      { insertTestCommunity },
      { setPostClassifierToggleForTest },
    ] = await Promise.all([
      import('./classifier-input.mts'),
      import('@services/post-classifier/configuration'),
      import('@agents/classifiers/prepare-single-call'),
      import('@voucha/test-helpers/data'),
      import('@voucha/test-helpers/entities/users'),
      import('@voucha/test-helpers/entities/communities'),
      import('@voucha/test-helpers/entities/post-classifier-toggles'),
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
    expect(remote).not.toBeNull()
    if (!remote) throw new Error('The post classifier has no active remote configuration.')

    const cases: ClassifierGoldenCase[] = await Promise.all(
      postClassifierGoldenFixtures.map(async fixture => {
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

    await runClassifierGoldenSet(cases, {
      minimumFixturesPerCandidate: 3,
      toleratedUnexpectedFixturesPerCandidate: 1,
    })
  })
})
