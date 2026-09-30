import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAutotaggerRunConfiguration } from './configuration.mts'
import { autotaggerPaidLimitsConfig } from './limits-config.mts'

const restores: Array<() => void> = []

function overrideLimits(fields: Record<string, boolean | number>) {
  restores.push(overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, fields))
}

describe('C6 run configuration (real PG)', () => {
  afterEach(() => restores.splice(0).forEach(restore => restore()))

  it('pins the active prompt, model and shared actor for the receipt', async () => {
    const resolved = await resolveAutotaggerRunConfiguration()

    expect(resolved?.configuration).toMatchObject({
      revision: 1,
      actorId: resolved?.actorId,
      classifierId: expect.any(String),
      promptVersionId: expect.any(String),
      modelName: expect.any(String),
    })
    expect(resolved?.remote).toMatchObject({
      classifierId: resolved?.configuration.classifierId,
      capturedCandidates: true,
      candidates: [],
    })
    expect(JSON.parse(resolved!.configurationJson)).toEqual(resolved!.configuration)
  })

  it('keeps one identity however the tier caps or the kill switch history changes', async () => {
    const before = await resolveAutotaggerRunConfiguration()
    overrideLimits({
      post_plus_max_topics: 1,
      post_pro_max_topics: 2,
      rss_discoverable_llm_max_topics: 1,
    })
    const after = await resolveAutotaggerRunConfiguration()

    expect(after!.configurationSha256.equals(before!.configurationSha256)).toBe(true)
  })

  it('is no work only while the operator kill switch is off', async () => {
    overrideLimits({ enabled: false })
    expect(await resolveAutotaggerRunConfiguration()).toBeNull()

    restores.splice(0).forEach(restore => restore())
    expect(await resolveAutotaggerRunConfiguration()).not.toBeNull()
  })
})
