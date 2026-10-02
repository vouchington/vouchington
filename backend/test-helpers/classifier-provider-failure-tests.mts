import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  getAccountingUncertaintySource,
  OpenAiSpendCapBreachError,
} from '../services/ai-usage/index.mts'
import { describeClassifierPermanentFailures } from './classifier-provider-failure-permanent-tests.mts'
import {
  billed,
  type ClassifierFailureDriver,
  DAILY_CAP_MICROUNITS,
  failing,
  incompleteRunIds,
  OUTAGE,
  TRANSIENT,
} from './classifier-provider-failure-scenarios.mts'
import { describeClassifierUsageLedger } from './classifier-usage-ledger-tests.mts'
import { countAiUsageRecordsForResponseId } from './entities/ai-usage.mts'
import { sentryCaptureMessageMock } from './vitest.setup.sentry-mock.mts'
import { withReservedAiUsageDay } from './with-reserved-ai-usage-day.mts'

/**
 * Drives one classifier's run lifecycle through the real structured-decision client over a fake
 * `fetch`, so each OpenRouter failure is classified by the production status-and-body rules. Every
 * fixed classifier shares these outcomes, so each one's suite only supplies how to run its own run.
 */
export function describeClassifierProviderFailures(driver: ClassifierFailureDriver): void {
  const { slug } = driver

  describeClassifierPermanentFailures(driver)
  describeClassifierUsageLedger(driver)

  describe(`${slug} transient provider failures`, () => {
    it.each(TRANSIENT)(
      'releases the run for a retry on a %s and leaves it for the sweep',
      async (...scenario) => {
        await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
          const run = await driver.prepare()
          const fetch = failing(scenario[1], scenario[2], scenario[3])

          await expect(run.execute(fetch)).rejects.toMatchObject({
            code: 'provider-error',
            status: scenario[1],
            retryClass: 'transient',
            ...(scenario[3] ? { retryAfterMs: Number(scenario[3]['retry-after']) * 1000 } : {}),
          })

          expect(fetch).toHaveBeenCalledOnce()
          expect(await run.facts()).toMatchObject({
            terminal_failed_at: null,
            provider_attempts_started: 1,
            lease_token: null,
          })
          expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
          expect(await incompleteRunIds()).toContain(run.runId)
          await expect(run.claim()).resolves.toBe('claimed')
        })
      },
    )

    it('bills a retried outage exactly once and never reserves a second attempt for the same outcome', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async day => {
        const run = await driver.prepare()
        const responseId = `decision-${randomUUID()}`
        const outage = failing(403, OUTAGE)
        const success = billed(responseId)

        await expect(run.execute(outage)).rejects.toMatchObject({ retryClass: 'transient' })
        await expect(run.claim()).resolves.toBe('claimed')
        await expect(run.execute(success)).resolves.toBe('persisted')
        await expect(run.execute(success)).resolves.toBe('replay')

        expect(outage).toHaveBeenCalledOnce()
        expect(success).toHaveBeenCalledOnce()
        expect(await run.facts()).toMatchObject({
          provider_attempts_started: 2,
          outcomes_persisted_at: expect.any(Date),
          terminal_failed_at: null,
        })
        await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
        await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
      })
    })

    it('keeps the spend-cap latch: an ambiguous 503 denies the retry before it reserves a second attempt', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async day => {
        const run = await driver.prepare()
        const retry = billed(`decision-${randomUUID()}`)

        await expect(run.execute(failing(503, { code: 503 }))).rejects.toMatchObject({
          retryClass: 'transient',
        })
        await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
        await expect(run.claim()).resolves.toBe('claimed')
        await expect(run.execute(retry)).rejects.toBeInstanceOf(OpenAiSpendCapBreachError)

        expect(retry).not.toHaveBeenCalled()
        expect(await run.facts()).toMatchObject({
          provider_attempts_started: 1,
          terminal_failed_at: null,
          lease_token: null,
        })
      })
    })

    it('ends the run as provider-error when transient failures use up the attempt cap', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await driver.prepare()
        const fetch = failing(403, OUTAGE)
        const options = { maxAttempts: 2 }

        await expect(run.execute(fetch, options)).rejects.toMatchObject({ retryClass: 'transient' })
        await expect(run.claim()).resolves.toBe('claimed')
        await expect(run.execute(fetch, options)).resolves.toBe('terminal')

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(await run.facts()).toMatchObject({
          provider_attempts_started: 2,
          terminal_failure_kind: 'provider-error',
          terminal_failed_at: expect.any(Date),
          lease_token: null,
        })
        expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
        await expect(run.claim()).resolves.toBe('terminal')
      })
    })
  })
}
