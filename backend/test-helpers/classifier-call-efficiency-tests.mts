import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStructuredDecisionProvider } from '../modules/structured-decisions/transport.mts'
import { installEfficiencyProvider } from './classifier-call-efficiency-provider.mts'
import {
  deliverRun,
  efficiencyWindow,
  ONE_BILLED_CALL,
  reportedContentVersion,
  reserveSeededRun,
  type EfficiencyDriver,
  type EfficiencySeed,
} from './classifier-call-efficiency-run.mts'
import { DAILY_CAP_MICROUNITS, OUTAGE } from './classifier-provider-failure-scenarios.mts'
import {
  expireClassifierRunLeaseForTest,
  getSubjectClassifierRunFacts,
} from './data-stores/psql/classifier-runs/run-facts.mts'
import { listAiUsageRecordsForClassifierRun } from './entities/ai-usage.mts'
import { withReservedAiUsageDay } from './with-reserved-ai-usage-day.mts'

/**
 * The D3 call-efficiency scenarios every fixed classifier scope shares. Each asserts the provider's
 * own request count and the ledger rows as well as what the C12 usage report says, so a report that
 * miscounted could not pass them. The window is taken before the reserved day fakes `Date`, and
 * every ledger read is inside that day: releasing it deletes the rows it holds.
 */
export function describeClassifierCallEfficiency(driver: EfficiencyDriver): void {
  const [fewer] = driver.fanOuts
  const factsOf = (seed: EfficiencySeed) => getSubjectClassifierRunFacts(seed.subject, driver.slug)
  const reportOf = (window: ReturnType<typeof efficiencyWindow>, seed: EfficiencySeed) =>
    reportedContentVersion(window, driver.slug, seed)

  describe(`${driver.scope} call efficiency (real PG, deterministic provider)`, () => {
    let release: (() => Promise<void>) | undefined
    beforeAll(async () => {
      release = await driver.initialize?.()
    })
    beforeEach(() => {
      vi.stubEnv('OPENROUTER_API_KEY', 'test-provider-key')
    })
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.mocked(fetchStructuredDecisionProvider).mockReset()
    })
    afterAll(async () => release?.())

    it.each(driver.fanOuts)(
      'bills one call for a content version with %i candidates',
      async fanOut => {
        const provider = installEfficiencyProvider({ latencyMs: 250 })
        const window = efficiencyWindow()
        const seed = await driver.seed(fanOut)
        await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
          const run = await reserveSeededRun(driver.slug, seed)
          expect(await deliverRun(driver.slug, run)).toBe('completed')

          expect(provider.requests).toHaveLength(1)
          expect(provider.requests[0]).toHaveLength(driver.questions(fanOut))
          expect(await listAiUsageRecordsForClassifierRun(run.runId)).toHaveLength(1)
          expect(await factsOf(seed)).toMatchObject([{ provider_attempts_started: 1 }])
          const { version, runs } = await reportOf(window, seed)
          expect(runs).toHaveLength(1)
          expect(version).toMatchObject({ ...ONE_BILLED_CALL, attemptsStarted: 1 })
          expect(version?.latencyMsTotal).toBeGreaterThanOrEqual(250)
        })
      },
    )

    it('never bills again for a lease expiring after persisting, a redelivery or a re-trigger', async () => {
      const provider = installEfficiencyProvider()
      const window = efficiencyWindow()
      const seed = await driver.seed(fewer)
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await reserveSeededRun(driver.slug, seed)
        expect(await driver.executeWithoutCompleting(run)).toBe('persisted')
        await expireClassifierRunLeaseForTest(run.runId)
        expect(await deliverRun(driver.slug, run)).toBe('completed')
        const applied = await seed.effects()

        expect(await deliverRun(driver.slug, run)).toBe('replay')
        const again = await reserveSeededRun(driver.slug, seed)
        expect(again.runId).toBe(run.runId)
        expect(await deliverRun(driver.slug, again)).toBe('replay')

        expect(provider.requests).toHaveLength(1)
        expect(await seed.effects()).toEqual(applied)
        expect(await listAiUsageRecordsForClassifierRun(run.runId)).toHaveLength(1)
        const { version } = await reportOf(window, seed)
        expect(version).toMatchObject({ ...ONE_BILLED_CALL, attemptsStarted: 1 })
      })
    })

    it('bills only the answered call when an earlier attempt was refused', async () => {
      const provider = installEfficiencyProvider()
      provider.refuseNext(1)
      const window = efficiencyWindow()
      const seed = await driver.seed(fewer)
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await reserveSeededRun(driver.slug, seed)
        await expect(deliverRun(driver.slug, run)).rejects.toThrow(OUTAGE.message)
        expect(await deliverRun(driver.slug, run)).toBe('completed')

        expect(provider.requests).toHaveLength(2)
        expect(provider.billedResponseIds).toHaveLength(1)
        expect(await listAiUsageRecordsForClassifierRun(run.runId)).toHaveLength(1)
        expect(await factsOf(seed)).toMatchObject([{ provider_attempts_started: 2 }])
        const { version } = await reportOf(window, seed)
        expect(version).toMatchObject({
          ...ONE_BILLED_CALL,
          retries: 1,
          attemptsStarted: 2,
          attemptsWithoutRecordedResponse: 1,
        })
      })
    })

    it.runIf(driver.lateCandidates)(
      'asks nothing again when the candidate set changed after the run completed',
      async () => {
        const provider = installEfficiencyProvider()
        const seed = await driver.seed(fewer)
        await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
          const run = await reserveSeededRun(driver.slug, seed)
          expect(await deliverRun(driver.slug, run)).toBe('completed')
          await seed.addCandidate?.()

          const again = await reserveSeededRun(driver.slug, seed)
          expect(again.runId).toBe(run.runId)
          expect(await deliverRun(driver.slug, again)).toBe('replay')

          expect(provider.requests).toHaveLength(1)
          expect(await factsOf(seed)).toHaveLength(1)
        })
      },
    )
  })
}
