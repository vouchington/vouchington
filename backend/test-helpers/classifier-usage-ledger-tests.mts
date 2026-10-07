import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  billed,
  BILLED_USAGE,
  billedUndecodable,
  type ClassifierFailureDriver,
  DAILY_CAP_MICROUNITS,
  failing,
  OUTAGE,
} from './classifier-provider-failure-scenarios.mts'
import { listAiUsageRecordsForClassifierRun } from './entities/ai-usage.mts'
import { withReservedAiUsageDay } from './with-reserved-ai-usage-day.mts'

const LATENCY_MS = 250

const BILLED_ROW = {
  input_tokens: BILLED_USAGE.inputTokens,
  output_tokens: BILLED_USAGE.outputTokens,
  cost_microunits: BILLED_USAGE.costMicrounits,
  pricing_status: 'priced',
}

/**
 * What the usage ledger keeps for one classifier run. The cost, latency and fan-out report reads
 * these rows by run, so each outcome the executor can reach has to leave exactly the rows (and the
 * missing rows) the report's figures assume.
 */
export function describeClassifierUsageLedger(driver: ClassifierFailureDriver): void {
  describe(`${driver.slug} usage attribution`, () => {
    it('attributes a billed answer to its run with tokens, cost and latency, once across a replay', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await driver.prepare()
        const success = billed(`decision-${randomUUID()}`, LATENCY_MS)

        await expect(run.execute(success)).resolves.toBe('persisted')
        await expect(run.execute(success)).resolves.toBe('replay')

        expect(success).toHaveBeenCalledOnce()
        expect(await listAiUsageRecordsForClassifierRun(run.runId)).toEqual([
          expect.objectContaining({
            classifier_run_id: run.runId,
            latency_milliseconds: LATENCY_MS,
            ...BILLED_ROW,
          }),
        ])
      })
    })

    it('keeps the usage of a billed answer that cannot be decoded', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await driver.prepare()

        await expect(
          run.execute(billedUndecodable(`decision-${randomUUID()}`, LATENCY_MS)),
        ).rejects.toMatchObject({ code: 'invalid-response' })

        expect(await run.facts()).toMatchObject({ provider_attempts_started: 1 })
        expect(await listAiUsageRecordsForClassifierRun(run.runId)).toEqual([
          expect.objectContaining({ latency_milliseconds: LATENCY_MS, ...BILLED_ROW }),
        ])
      })
    })

    it('writes no row for a request that returned no billed response', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await driver.prepare()

        await expect(run.execute(failing(403, OUTAGE))).rejects.toMatchObject({
          retryClass: 'transient',
        })

        expect(await run.facts()).toMatchObject({ provider_attempts_started: 1 })
        expect(await listAiUsageRecordsForClassifierRun(run.runId)).toEqual([])
      })
    })

    it('attributes only the billed retry after an outage, which still counts both attempts', async () => {
      await withReservedAiUsageDay(DAILY_CAP_MICROUNITS, async () => {
        const run = await driver.prepare()

        await expect(run.execute(failing(403, OUTAGE))).rejects.toMatchObject({
          retryClass: 'transient',
        })
        await expect(run.claim()).resolves.toBe('claimed')
        await expect(run.execute(billed(`decision-${randomUUID()}`, LATENCY_MS))).resolves.toBe(
          'persisted',
        )

        expect(await run.facts()).toMatchObject({ provider_attempts_started: 2 })
        expect(await listAiUsageRecordsForClassifierRun(run.runId)).toEqual([
          expect.objectContaining({ latency_milliseconds: LATENCY_MS, ...BILLED_ROW }),
        ])
      })
    })
  })
}
