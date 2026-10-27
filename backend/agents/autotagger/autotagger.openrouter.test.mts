import { describe, expect, it } from 'vitest'
import { buildAutotaggerGoldenCases } from '@voucha/test-helpers/autotagger-golden-cases'
import { autotaggerGoldenFixtures } from '@voucha/test-helpers/classifier-golden-fixtures'
import { runClassifierSmokeCase } from '@voucha/test-helpers/classifier-smoke'

describe('autotagger on OpenRouter', () => {
  // no-mistakes-timeout-reason: one live OpenRouter call under its own deadline, plus one retry
  it('answers every candidate of one fixture through the production prompt', async () => {
    const [testCase] = await buildAutotaggerGoldenCases(autotaggerGoldenFixtures.slice(0, 1))
    const results = await runClassifierSmokeCase(testCase!)
    expect(results.length).toBeGreaterThan(0)
  }, 10_000)
})
