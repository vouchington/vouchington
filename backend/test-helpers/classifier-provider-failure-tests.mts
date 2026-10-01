import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import type { ClassifierRunExecution } from '../agents/classifier-runs/index.mts'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import {
  getAccountingUncertaintySource,
  OpenAiSpendCapBreachError,
} from '../services/ai-usage/index.mts'
import { listIncompleteClassifierRuns } from '../services/classifier-runs/index.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import type { ClassifierRunFacts } from './data-stores/psql/classifier-runs/run-facts.mts'
import { countAiUsageRecordsForResponseId } from './entities/ai-usage.mts'
import { sentryCaptureMessageMock } from './vitest.setup.sentry-mock.mts'
import { withReservedAiUsageDay } from './with-reserved-ai-usage-day.mts'

export type ClassifierFailureRun = {
  runId: string
  /** Runs the currently leased run once against the provider boundary `fetch`. */
  execute(
    fetch: StructuredDecisionFetch,
    options?: { maxAttempts?: number; apiKey?: string },
  ): Promise<ClassifierRunExecution>
  /** Claims the run as a queue retry or the sweep would, returning what the claim found. */
  claim(): Promise<string>
  facts(): Promise<ClassifierRunFacts>
}

export type ClassifierFailureDriver = {
  slug: string
  /** A freshly reserved, leased run with remote work and no local outcome. */
  prepare(): Promise<ClassifierFailureRun>
}

const DAILY_CAP_MICROUNITS = 1_000_000
const FLAGGED_INPUT = 'the private post text the moderation provider flagged'
const OUTAGE = {
  code: 403,
  message: 'Provider returned error',
  metadata: { provider_name: 'Azure' },
}

type Scenario = [name: string, status: number, error: object, headers?: Record<string, string>]

const PERMANENT: Scenario[] = [
  ['401 rejected key', 401, { code: 401, message: 'No auth credentials found' }],
  ['402 out of credits', 402, { code: 402, message: 'Insufficient credits' }],
  ['400 malformed request', 400, { code: 400, message: 'Invalid request' }],
  [
    '403 guardrail block',
    403,
    { code: 403, message: 'Blocked by a guardrail', metadata: { patterns: ['secret'] } },
  ],
]

const TRANSIENT: Scenario[] = [
  ['403 provider outage', 403, OUTAGE],
  ['429 rate limit', 429, { code: 429, message: 'Rate limited' }, { 'retry-after': '12' }],
  ['503 unavailable', 503, { code: 503, message: 'No provider available' }],
  ['408 timeout', 408, { code: 408, message: 'Request timed out' }],
  [
    '402 in-flight budget',
    402,
    {
      code: 402,
      message: 'Budget in use',
      metadata: { limit_source: 'openrouter_in_flight_budget' },
    },
  ],
]

function failing(status: number, error: object, headers?: Record<string, string>) {
  return vi.fn<StructuredDecisionFetch>(async () =>
    Response.json({ error }, { status, ...(headers ? { headers } : {}) }),
  )
}

/** A billed, decodable provider answer for every question the request asked. */
function billed(responseId: string) {
  return vi.fn<StructuredDecisionFetch>(async (_url, init) => {
    const body = JSON.parse(stringFromUnknown(init?.body)) as { questions: Record<string, unknown> }
    return Response.json({
      id: responseId,
      model: 'typesafe/jev-1.13-20260917',
      provider: 'TypeSafe',
      usage: { input_tokens: 12, output_tokens: 3, cost: 0.002 },
      answers: Object.keys(body.questions).map(id => ({ id, type: 'noul', noul: 0.9 })),
    })
  })
}

async function incompleteRunIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  let after: string | null = null
  do {
    const page: Awaited<ReturnType<typeof listIncompleteClassifierRuns>> =
      await listIncompleteClassifierRuns(after)
    for (const item of page.items) ids.add(item.runId)
    after = page.next
  } while (after)
  return ids
}

function expectAlarm(slug: string, kind: string, extra: object) {
  expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith('classifier_run_alarm', {
    level: 'error',
    fingerprint: ['classifier_run_alarm', kind, slug],
    tags: { reason: 'classifier_run_alarm', alarm_kind: kind, classifier: slug },
    extra: { classifier: slug, ...extra },
  })
}

/**
 * Drives one classifier's run lifecycle through the real structured-decision client over a fake
 * `fetch`, so each OpenRouter failure is classified by the production status-and-body rules. Every
 * fixed classifier shares these outcomes, so each one's suite only supplies how to run its own run.
 */
export function describeClassifierProviderFailures(driver: ClassifierFailureDriver): void {
  const { slug } = driver
  const transientWith = (failure: Scenario) => failing(failure[1], failure[2], failure[3])

  describe(`${slug} provider failures`, () => {
    it.each(PERMANENT)(
      'ends the run at once on a %s and never retries or re-dispatches it',
      async (...scenario) => {
        await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async day => {
          const run = await driver.prepare()
          const fetch = transientWith(scenario)

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

    it.each(TRANSIENT)(
      'releases the run for a retry on a %s and leaves it for the sweep',
      async (...scenario) => {
        await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
          const run = await driver.prepare()
          const fetch = transientWith(scenario)

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
        error: expect.stringContaining('API key is required'),
      })
      await expect(run.claim()).resolves.toBe('terminal')
    })
  })
}
