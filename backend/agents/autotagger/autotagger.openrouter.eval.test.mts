import { describe, expect, it } from 'vitest'
import { buildAutotaggerGoldenCases } from '@voucha/test-helpers/autotagger-golden-cases'
import { autotaggerGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import { runClassifierGoldenSet } from '@voucha/test-helpers/classifier-golden-set'

// A dispatch-only eval (`backend-evals-openrouter`): it spends one provider call per fixture and
// judges decision bands, so it never runs in CI. The credentialed smoke test is
// autotagger.openrouter.test.mts.
describe('autotagger golden regression set', () => {
  // no-mistakes-timeout-reason: live OpenRouter fixture response latency
  it('keeps synthetic tagging decisions in their configured bands', async () => {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      throw new Error('OPENROUTER_API_KEY is required for this eval.')
    }
    const cases = await buildAutotaggerGoldenCases(autotaggerGoldenFixtures)
    await expect(
      runClassifierGoldenSet(cases, {
        minimumFixturesPerCandidate: 3,
        toleratedUnexpectedFixturesPerCandidate: 1,
      }),
    ).resolves.toBeUndefined()
  }, 30_000)
})
