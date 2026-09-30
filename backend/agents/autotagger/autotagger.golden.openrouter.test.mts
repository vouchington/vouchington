import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { autotaggerGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import {
  runClassifierGoldenSet,
  classifierGoldenBatchId,
  type ClassifierGoldenCase,
} from '@voucha/test-helpers/classifier-golden-set'

const apiKey = process.env.OPENROUTER_API_KEY ?? ''

describe('autotagger golden regression set', () => {
  it.skipIf(!apiKey)('keeps synthetic tagging decisions in their configured bands', async () => {
    const [
      { buildAutotaggerClassifierBindingsAndDigest },
      { buildPostClassifierState, buildRssFeedItemClassifierState },
      { getActiveClassifierConfigurationBySlugFromPrimary },
      { prepareSingleCallClassifierDecision },
    ] = await Promise.all([
      import('./dispatch-classifier-bindings.mts'),
      import('./content.mts'),
      import('@services/classifiers'),
      import('@agents/classifiers/prepare-single-call'),
    ])
    const configuration = await getActiveClassifierConfigurationBySlugFromPrimary('tagging')
    expect(configuration?.modelProvider).toBe('openrouter')
    if (!configuration) throw new Error('The tagging classifier has no active configuration.')

    const cases: ClassifierGoldenCase[] = await Promise.all(
      autotaggerGoldenFixtures.map(async fixture => {
        if (typeof fixture.candidateSlate === 'string') {
          throw new Error(`Fixture ${fixture.id} must declare its synthetic candidate slate.`)
        }
        const candidateSlate = fixture.candidateSlate
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
        const candidates = candidateSlate.map(name => ({
          topicId: randomUUID(),
          name,
        }))
        const { bindings } = await buildAutotaggerClassifierBindingsAndDigest(configuration, {
          subject,
          state,
          candidates,
          maxCandidates: candidates.length,
        })
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

    await runClassifierGoldenSet(cases, {
      minimumFixturesPerCandidate: 3,
      toleratedUnexpectedFixturesPerCandidate: 1,
    })
  })
})
