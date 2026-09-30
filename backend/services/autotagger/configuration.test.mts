import type { QueryExecutor } from '@data-stores/psql'
import { reserveClassifierRun } from '@services/classifier-runs'
import {
  createAutotaggerPostFixture,
  requestAutotaggerRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterEach, describe, expect, it } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'
import { resolveAutotaggerRunConfiguration } from './configuration.mts'
import { autotaggerPaidLimitsConfig } from './limits-config.mts'

/** A database with no active classifier row, so the seeded configuration reads as missing. */
const withoutClassifier: QueryExecutor = async () => ({
  command: 'SELECT',
  fields: [],
  oid: 0,
  rowCount: 0,
  rows: [],
})

describe('C6 run configuration (real PG)', () => {
  const restores: Array<() => void> = []
  const overrideLimits = (fields: Record<string, boolean | number>) =>
    restores.push(overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, fields))
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

  it('throws for a missing classifier instead of settling the request as no work', async () => {
    await expect(resolveAutotaggerRunConfiguration(withoutClassifier)).rejects.toThrow(
      "Classifier configuration for slug 'tagging' not found",
    )
  })
})

describe('C6 configuration failure never blocks approval (real PG)', () => {
  it('leaves the request pending for the sweep, and reserves once the configuration is back', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestAutotaggerRun(fixture)
    const adapter = createAutotaggerRunAdapter()
    const unresolvable = {
      ...adapter,
      resolve: () => resolveAutotaggerRunConfiguration(withoutClassifier),
    }

    await expect(reserveClassifierRun(unresolvable, fixture.subject)).rejects.toThrow('not found')

    expect(await getSubjectClassifierRunFacts(fixture.subject)).toEqual([])
    expect(await getSubjectClassifierRunRequestFacts(fixture.subject)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
    expect((await reserveClassifierRun(adapter, fixture.subject)).kind).toBe('reserved')
  })
})
