import { reserveClassifierRun } from '@services/classifier-runs'
import { getActiveClassifierConfigurationBySlugFromPrimary } from '@services/classifiers'
import {
  createAutotaggerPostFixture,
  requestAutotaggerRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  getSubjectClassifierRunFacts,
  getSubjectClassifierRunRequestFacts,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { describe, expect, it, vi } from 'vitest'
import { createAutotaggerRunAdapter } from './adapter.mts'
import { resolveAutotaggerRunConfiguration } from './configuration.mts'

vi.mock<typeof import('@services/classifiers')>(import('@services/classifiers'), async original => {
  const actual = await original()
  return {
    ...actual,
    getActiveClassifierConfigurationBySlugFromPrimary: vi.fn<
      typeof getActiveClassifierConfigurationBySlugFromPrimary
    >(actual.getActiveClassifierConfigurationBySlugFromPrimary),
  }
})

const adapter = createAutotaggerRunAdapter()

describe('C6 configuration failure (real PG)', () => {
  it('throws for a missing classifier instead of settling the request as no work', async () => {
    vi.mocked(getActiveClassifierConfigurationBySlugFromPrimary).mockImplementationOnce(
      async () => null,
    )

    await expect(resolveAutotaggerRunConfiguration()).rejects.toThrow(
      "Classifier configuration for slug 'tagging' not found",
    )
  })

  it('leaves the request pending for the sweep, and reserves once the configuration is back', async () => {
    const fixture = await createAutotaggerPostFixture()
    await requestAutotaggerRun(fixture)
    vi.mocked(getActiveClassifierConfigurationBySlugFromPrimary).mockImplementationOnce(
      async () => null,
    )

    await expect(reserveClassifierRun(adapter, fixture.subject)).rejects.toThrow('not found')

    expect(await getSubjectClassifierRunFacts(fixture.subject)).toEqual([])
    expect(await getSubjectClassifierRunRequestFacts(fixture.subject)).toMatchObject([
      { run_id: null, no_work_at: null, stale_at: null },
    ])
    expect((await reserveClassifierRun(adapter, fixture.subject)).kind).toBe('reserved')
  })
})
