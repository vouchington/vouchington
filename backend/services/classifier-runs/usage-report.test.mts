import { createClassifierDecisionCall } from '@voucha/test-helpers/data-stores/psql/classifier-fixture-operations'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import {
  overNewSyntheticPost,
  requestSyntheticRun,
  reserveCompletedSyntheticRun,
  reserveEndedSyntheticRun,
  reserveSyntheticRun,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import {
  completeRunWithoutTags,
  recordBilledCall,
  reservedAtMs,
  startProviderAttempts,
  windowAroundNow,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/usage-report-fixture'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
  type PostClassifierExecutionFixture,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { localOutcomeFor } from '@voucha/test-helpers/data-stores/psql/post-classifier/outcomes'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startClassifierProviderAttempt } from './run-attempt.mts'
import { readClassifierRunUsage } from './usage-report-runs.mts'
import { readClassifierUsageReport } from './usage-report.mts'

async function usageOf(setup: PostClassifierExecutionFixture) {
  const report = await readClassifierUsageReport(windowAroundNow())
  const run = report.runs.find(candidate => candidate.runId === setup.run.runId)
  if (!run) throw new Error('The run is missing from the report')
  return run
}

const questionCount = (setup: PostClassifierExecutionFixture) =>
  setup.lease.resolved.configuration.remote!.questions.length

describe('classifier usage report: remote runs (real PG)', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('reports one billed call that decided every candidate, with the local detector at zero cost', async () => {
    const setup = await createPostClassifierExecutionFixture(
      ['self-promotion', 'marketplace'],
      true,
    )
    await startProviderAttempts(setup, 1)
    await recordBilledCall(setup, { latencyMs: 250 })
    await completeRunWithoutTags(setup)

    const run = await usageOf(setup)

    expect(questionCount(setup)).toBeGreaterThan(1)
    expect(run).toMatchObject({
      classifier: 'post-classifier',
      outcome: 'completed',
      batchId: setup.lease.decisionBatchId,
      promptVersionId: setup.lease.resolved.configuration.remote!.promptVersionId,
      provider: expect.any(String),
      model: expect.any(String),
      attemptsStarted: 1,
      retries: 0,
      providerCalls: 1,
      unbilledAttempts: 0,
      shardCount: 1,
      candidateCount: questionCount(setup),
      inputTokens: 12,
      outputTokens: 3,
      pricedCalls: 1,
      unpricedCalls: 0,
      costMicrounits: '2000',
      latencyMsTotal: 250,
      latencyMsMax: 250,
      latencySamples: 1,
      localDetector: 'test-detector',
    })
  })

  it('counts the billed retry once and the attempt that returned nothing as unbilled', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startProviderAttempts(setup, 2)
    await recordBilledCall(setup, { latencyMs: 90 })
    await completeRunWithoutTags(setup)

    expect(await usageOf(setup)).toMatchObject({
      attemptsStarted: 2,
      retries: 1,
      providerCalls: 1,
      unbilledAttempts: 1,
      localDetector: null,
    })
  })

  it('keeps every billed response of a run that never decided, priced or not', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startProviderAttempts(setup, 2)
    await recordBilledCall(setup, { latencyMs: 100 })
    await recordBilledCall(setup, { latencyMs: 300, unpriced: true })

    expect(await usageOf(setup)).toMatchObject({
      outcome: 'incomplete',
      shardCount: 0,
      candidateCount: 0,
      providerCalls: 2,
      unbilledAttempts: 0,
      pricedCalls: 1,
      unpricedCalls: 1,
      inputTokens: 24,
      outputTokens: 6,
      costMicrounits: '2000',
      latencyMsTotal: 400,
      latencyMsMax: 300,
      latencySamples: 2,
    })
  })

  it('counts a duplicate response once, with the first attribution kept', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startProviderAttempts(setup, 1)
    const responseId = `decision-duplicate-${setup.run.runId}`

    await expect(recordBilledCall(setup, { latencyMs: 80, responseId })).resolves.toBe('recorded')
    await expect(recordBilledCall(setup, { latencyMs: 999, responseId })).resolves.toBe(
      'already-recorded',
    )

    expect(await usageOf(setup)).toMatchObject({
      providerCalls: 1,
      costMicrounits: '2000',
      latencyMsTotal: 80,
    })
  })

  it('reports a run that spent its attempts as failed, with a local outcome and no provider call', async () => {
    const setup = await createPostClassifierExecutionFixture(true, true)
    await startProviderAttempts(setup, 1)
    await expect(
      startClassifierProviderAttempt(setup.adapter, {
        lease: setup.lease,
        maxAttempts: 1,
        local: localOutcomeFor(setup, true),
      }),
    ).resolves.toBe('terminal')

    expect(await usageOf(setup)).toMatchObject({
      outcome: 'failed:attempts-exhausted',
      attemptsStarted: 1,
      providerCalls: 0,
      unbilledAttempts: 1,
      costMicrounits: '0',
      latencyMsMax: null,
      latencySamples: 0,
      localDetector: 'test-detector',
    })
  })

  it('counts every shard of one batch with one provider call each', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startProviderAttempts(setup, 1)
    await recordBilledCall(setup, { latencyMs: 40 })
    await completeRunWithoutTags(setup)
    await createClassifierDecisionCall(setup.lease.decisionBatchId!, 1)
    await recordBilledCall(setup, { latencyMs: 60 })

    expect(await usageOf(setup)).toMatchObject({
      shardCount: 2,
      providerCalls: 2,
      candidateCount: questionCount(setup),
      costMicrounits: '4000',
      latencyMsTotal: 100,
      latencyMsMax: 60,
    })
  })

  it('reports a local-only run with no batch, no model and no provider usage', async () => {
    const setup = await createPostClassifierExecutionFixture(false, true)
    await completeRunWithoutTags(setup)

    expect(await usageOf(setup)).toMatchObject({
      outcome: 'completed',
      batchId: null,
      promptVersionId: null,
      model: null,
      shardCount: 0,
      candidateCount: 0,
      providerCalls: 0,
      costMicrounits: '0',
      localDetector: 'test-detector',
    })
  })

  it('selects runs by reservation time, and still counts a retry billed after the window', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    await startProviderAttempts(setup, 1)
    await recordBilledCall(setup, { latencyMs: 10 })
    const at = reservedAtMs(setup.run.runId)
    const runIds = async (from: number, to: number) =>
      (await readClassifierRunUsage({ from: new Date(from), to: new Date(to) })).map(r => r.runId)

    expect(await runIds(at - 1000, at + 1)).toContain(setup.run.runId)
    expect(await runIds(at + 1, at + 60_000)).not.toContain(setup.run.runId)
    expect(await runIds(at - 60_000, at)).not.toContain(setup.run.runId)
    const [row] = (
      await readClassifierRunUsage({ from: new Date(at - 1000), to: new Date(at + 1) })
    ).filter(r => r.runId === setup.run.runId)
    expect(row).toMatchObject({ providerCalls: 1, costMicrounits: '2000' })
  })

  it('refuses an empty window and a window with more runs than it will return', async () => {
    const setup = await createPostClassifierExecutionFixture(true, false)
    const at = reservedAtMs(setup.run.runId)
    const reversed = { from: new Date(at), to: new Date(at) }

    await expect(readClassifierUsageReport(reversed)).rejects.toThrow(RangeError)
    await expect(
      readClassifierRunUsage({ from: new Date(at - 1000), to: new Date(at + 1) }, 0),
    ).rejects.toThrow('too many runs')
  })
})

describe('classifier usage report: one classifier over many runs (real PG)', () => {
  it('sums the runs of a classifier and counts its durable requests', async () => {
    const setup = await createSyntheticFixture()
    await requestSyntheticRun(setup)
    await requestSyntheticRun(await overNewSyntheticPost(setup))
    await reserveSyntheticRun(setup)
    await reserveCompletedSyntheticRun(setup)
    await reserveEndedSyntheticRun(setup, 'provider-error')

    const report = await readClassifierUsageReport(windowAroundNow())

    expect(report.requests[setup.slug]).toBe(2)
    expect(report.groups.filter(group => group.classifier === setup.slug)).toEqual([
      expect.objectContaining({
        runs: 3,
        outcomes: { completed: 1, 'failed:provider-error': 1, incomplete: 1 },
        providerCalls: 0,
        shards: 0,
        costMicrounits: '0',
        localDetectorCalls: 0,
        localCostMicrounits: '0',
      }),
    ])
  })
})
