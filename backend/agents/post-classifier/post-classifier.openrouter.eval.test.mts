import { describe, expect, it } from 'vitest'
import { postClassifierGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import { runClassifierGoldenSet } from '@voucha/test-helpers/classifier-golden-set'
import { buildPostClassifierGoldenCases } from '@voucha/test-helpers/post-classifier-golden-cases'

// A dispatch-only eval (`backend-evals-openrouter`): it spends one provider call per fixture and
// judges decision bands, so it never runs in CI. The credentialed smoke test is
// post-classifier.openrouter.test.mts.
describe('post classifier golden regression set', () => {
  // no-mistakes-timeout-reason: live OpenRouter fixture response latency
  it('keeps synthetic post decisions in their configured bands', async () => {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new Error('OPENROUTER_API_KEY is required for this eval.')
    }
    const cases = await buildPostClassifierGoldenCases(postClassifierGoldenFixtures)
    await expect(
      runClassifierGoldenSet(cases, {
        minimumFixturesPerCandidate: 3,
        toleratedUnexpectedFixturesPerCandidate: 1,
      }),
    ).resolves.toBeUndefined()
  }, 30_000)
})
