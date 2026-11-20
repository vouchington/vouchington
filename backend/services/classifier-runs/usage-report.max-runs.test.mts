import { reservedAtMs } from '@voucha/test-helpers/data-stores/psql/classifier-runs/usage-report-fixture'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { reserveTestAiUsageRetentionSweep } from '@voucha/test-helpers/entities/ai-usage-rollups'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readClassifierRunUsage } from './usage-report-runs.mts'
import { classifierRunsWorkConfig } from './work-limits.mts'

describe('classifier usage report: run count guard (real PG)', () => {
  let releaseAiMonthlyDdlPhase: (() => Promise<void>) | undefined
  let release: (() => Promise<void>) | undefined
  // no-mistakes-timeout-reason: real retention sweep reservation serializes DDL files across forks.
  beforeAll(async () => {
    releaseAiMonthlyDdlPhase = await reserveTestAiUsageRetentionSweep()
    release = await initializePostClassifierExecutionTests()
  }, 30_000)
  afterAll(async () => {
    await release?.()
    await releaseAiMonthlyDdlPhase?.()
  })

  it('refuses a window with more runs than the configured maximum', async () => {
    const first = await createPostClassifierExecutionFixture(true, false)
    const second = await createPostClassifierExecutionFixture(true, false)
    const window = {
      from: new Date(reservedAtMs(first.run.runId) - 1000),
      to: new Date(reservedAtMs(second.run.runId) + 1),
    }
    await classifierRunsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(classifierRunsWorkConfig, {
      usage_report_max_runs: 1,
    })
    try {
      await expect(readClassifierRunUsage(window)).rejects.toThrow('too many runs')
    } finally {
      restore()
    }

    expect((await readClassifierRunUsage(window)).map(run => run.runId)).toEqual(
      expect.arrayContaining([first.run.runId, second.run.runId]),
    )
  })
})
