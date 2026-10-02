import { describe, expect, it } from 'vitest'
import { getAccountingUncertaintySource } from '../services/ai-usage/index.mts'
import { getClassifierRunHandler } from '../workers/ai-agents/processors/classifier-run-registry.mts'
import {
  type ClassifierFailureDriver,
  DAILY_CAP_MICROUNITS,
  expectAlarm,
  failing,
  FLAGGED_INPUT,
  incompleteRunIds,
  PERMANENT,
} from './classifier-provider-failure-scenarios.mts'
import { sentryCaptureMessageMock } from './vitest.setup.sentry-mock.mts'
import { withReservedAiUsageDay } from './with-reserved-ai-usage-day.mts'

/** A failure that can never succeed on retry ends the run at once, and says so only when it matters. */
export function describeClassifierPermanentFailures(driver: ClassifierFailureDriver): void {
  const { slug } = driver

  describe(`${slug} permanent provider failures`, () => {
    it.each(PERMANENT)(
      'ends the run at once on a %s and never retries or re-dispatches it',
      async (...scenario) => {
        await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async day => {
          const run = await driver.prepare()
          const fetch = failing(scenario[1], scenario[2], scenario[3])

          await expect(run.execute(fetch)).resolves.toBe('terminal')

          expect(fetch).toHaveBeenCalledOnce()
          expect(await run.facts()).toMatchObject({
            terminal_failure_kind: 'provider-error',
            terminal_failed_at: expect.any(Date),
            provider_attempts_started: 1,
            lease_token: null,
          })
          expectAlarm(slug, 'provider-rejected', {
            runId: run.runId,
            status: scenario[1],
            providerCode: scenario[1],
          })
          expect(JSON.stringify(sentryCaptureMessageMock.mock.calls)).not.toContain(
            (scenario[2] as { message: string }).message,
          )
          await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
          await expect(run.claim()).resolves.toBe('terminal')
          await expect(run.execute(fetch)).resolves.toBe('stale')
          expect(fetch).toHaveBeenCalledOnce()
          expect(await incompleteRunIds()).not.toContain(run.runId)
        })
      },
    )

    it('ends the run as context-rejected on a moderation 403, quietly and without the flagged input', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await driver.prepare()
        const fetch = failing(403, {
          code: 403,
          message: `Input flagged: ${FLAGGED_INPUT}`,
          metadata: { reasons: ['harassment'], flagged_input: FLAGGED_INPUT },
        })

        await expect(run.execute(fetch)).resolves.toBe('terminal')

        expect(fetch).toHaveBeenCalledOnce()
        expect(await run.facts()).toMatchObject({
          terminal_failure_kind: 'context-rejected',
          terminal_failed_at: expect.any(Date),
          provider_attempts_started: 1,
          lease_token: null,
        })
        expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
        await expect(run.claim()).resolves.toBe('terminal')
      })
    })

    it('keeps a missing API key out of the retry path as a client-unavailable terminal run', async () => {
      const run = await driver.prepare()
      const fetch = failing(503, { code: 503 })

      await expect(run.execute(fetch, { apiKey: '' })).resolves.toBe('terminal')

      expect(fetch).not.toHaveBeenCalled()
      expect(await run.facts()).toMatchObject({
        terminal_failure_kind: 'client-unavailable',
        provider_attempts_started: 0,
        lease_token: null,
      })
      expectAlarm(slug, 'client-unavailable', {
        runId: run.runId,
        errorName: 'StructuredDecisionError',
      })
      // The terminal counts show the missing key under its own kind, which the health check alarms on.
      const { terminal } = await getClassifierRunHandler(slug).health(new Date())
      expect(terminal.failed['client-unavailable']).toBeGreaterThanOrEqual(1)
      await expect(run.claim()).resolves.toBe('terminal')
    })
  })
}
