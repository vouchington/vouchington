import { classifierRunUsage as run } from '@voucha/test-helpers/classifier-run-usage'
import { describe, expect, it } from 'vitest'
import {
  summarizeClassifierContentVersions,
  summarizeClassifierEfficiency,
} from './usage-report-efficiency.mts'

describe('summarizeClassifierContentVersions (deterministic fixtures)', () => {
  it('reports no content versions for no runs', () => {
    expect(summarizeClassifierContentVersions([])).toEqual([])
    expect(summarizeClassifierEfficiency([])).toEqual([])
  })

  it('counts one billed call for a content version that took one', () => {
    const [version] = summarizeClassifierContentVersions([run({})])

    expect(version).toMatchObject({
      runs: 1,
      billedRuns: 1,
      reclassifications: 0,
      providerCalls: 1,
      persistedDecisionCalls: 1,
      retries: 0,
      costMicrounits: '2000',
      latencyMsTotal: 200,
      latencySamples: 1,
      localDetectorRuns: 0,
    })
  })

  it('keeps a retry whose first attempt billed nothing at one call', () => {
    const [version] = summarizeClassifierContentVersions([
      run({ attemptsStarted: 2, retries: 1, attemptsWithoutRecordedResponse: 1, sweepEnqueues: 1 }),
    ])

    expect(version).toMatchObject({
      providerCalls: 1,
      attemptsStarted: 2,
      retries: 1,
      attemptsWithoutRecordedResponse: 1,
      sweepEnqueues: 1,
      reclassifications: 0,
    })
  })

  it('counts a second billed run of the same content as a re-classification', () => {
    const versions = summarizeClassifierContentVersions([
      run({ runId: 'a', configurationSha256: 'bb' }),
      run({ runId: 'b', configurationSha256: 'cc', costMicrounits: '500' }),
    ])

    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      runs: 2,
      billedRuns: 2,
      reclassifications: 1,
      providerCalls: 2,
      maxProviderCallsPerRun: 1,
      runsOverOneCall: 0,
      costMicrounits: '2500',
    })
  })

  it('does not count a run that billed nothing as a re-classification', () => {
    const [version] = summarizeClassifierContentVersions([
      run({ runId: 'a', configurationSha256: 'bb' }),
      run({
        runId: 'b',
        configurationSha256: 'cc',
        outcome: 'superseded',
        attemptsStarted: 0,
        providerCalls: 0,
        costMicrounits: '0',
        latencyMsTotal: 0,
        latencyMsMax: null,
        latencySamples: 0,
      }),
    ])

    expect(version).toMatchObject({
      runs: 2,
      billedRuns: 1,
      reclassifications: 0,
      providerCalls: 1,
    })
  })

  it('reports a local detector run as work that is never a provider call', () => {
    const [version] = summarizeClassifierContentVersions([
      run({
        attemptsStarted: 0,
        providerCalls: 0,
        shardCount: 0,
        costMicrounits: '0',
        latencyMsTotal: 0,
        latencyMsMax: null,
        latencySamples: 0,
        localDetector: 'detector',
      }),
    ])

    expect(version).toMatchObject({ providerCalls: 0, localDetectorRuns: 1, billedRuns: 0 })
  })

  it('splits content versions by input digest, subject and community publication', () => {
    const versions = summarizeClassifierContentVersions([
      run({ subjectId: 'p1', inputSha256: 'aa' }),
      run({ subjectId: 'p1', inputSha256: 'dd' }),
      run({ subjectId: 'p2', inputSha256: 'aa' }),
      run({ classifier: 'community-moderation', subjectId: 'p3', communityIdentityId: 'c1' }),
      run({ classifier: 'community-moderation', subjectId: 'p3', communityIdentityId: 'c2' }),
      run({ subjectKind: 'rss_feed_item', subjectId: 'p1', inputSha256: 'aa' }),
    ])

    expect(versions).toHaveLength(6)
    expect(versions.every(version => version.reclassifications === 0)).toBe(true)
    expect(versions.map(version => version.classifier)).toEqual([
      'community-moderation',
      'community-moderation',
      'post-classifier',
      'post-classifier',
      'post-classifier',
      'post-classifier',
    ])
    expect(versions.map(version => version.communityIdentityId).slice(0, 2)).toEqual(['c1', 'c2'])
  })
})

describe('summarizeClassifierEfficiency (deterministic fixtures)', () => {
  it('shows the KPI holding when every receipt took at most one call', () => {
    const efficiency = summarizeClassifierEfficiency(
      summarizeClassifierContentVersions([
        run({ subjectId: 'p1' }),
        run({
          subjectId: 'p2',
          attemptsStarted: 2,
          retries: 1,
          attemptsWithoutRecordedResponse: 1,
        }),
        run({
          subjectId: 'p3',
          attemptsStarted: 0,
          providerCalls: 0,
          costMicrounits: '0',
          latencyMsTotal: 0,
          latencyMsMax: null,
          latencySamples: 0,
          localDetector: 'detector',
        }),
      ]),
    )

    expect(efficiency).toEqual([
      {
        classifier: 'post-classifier',
        contentVersions: 3,
        runs: 3,
        providerCalls: 2,
        billedRuns: 2,
        maxProviderCallsPerRun: 1,
        runsOverOneCall: 0,
        reclassifications: 0,
        attemptsStarted: 3,
        retries: 1,
        sweepEnqueues: 0,
        attemptsWithoutRecordedResponse: 1,
        unfinishedRuns: 0,
        unpricedCalls: 0,
        costMicrounits: '4000',
        latencyMsTotal: 400,
        latencySamples: 2,
        localDetectorRuns: 1,
      },
    ])
  })

  it('counts the runs that are still unfinished, which can still call the provider', () => {
    const [efficiency] = summarizeClassifierEfficiency(
      summarizeClassifierContentVersions([
        run({ runId: 'a', subjectId: 'p1' }),
        run({ runId: 'b', subjectId: 'p2', outcome: 'incomplete' }),
        run({ runId: 'c', subjectId: 'p2', outcome: 'incomplete', configurationSha256: 'cc' }),
        run({ runId: 'd', subjectId: 'p3', outcome: 'superseded', providerCalls: 0 }),
      ]),
    )

    expect(efficiency).toMatchObject({ runs: 4, unfinishedRuns: 2, maxProviderCallsPerRun: 1 })
  })

  it('adds up the billed calls the ledger could not price', () => {
    const versions = summarizeClassifierContentVersions([
      run({ runId: 'a', unpricedCalls: 1 }),
      run({ runId: 'b', unpricedCalls: 2, configurationSha256: 'cc' }),
    ])
    const [efficiency] = summarizeClassifierEfficiency(versions)

    expect(versions[0]).toMatchObject({ unpricedCalls: 3, unfinishedRuns: 0 })
    expect(efficiency).toMatchObject({ unpricedCalls: 3, costMicrounits: '4000' })
  })

  it('reads a configuration change as a re-classification, not as a second call per receipt', () => {
    const [efficiency] = summarizeClassifierEfficiency(
      summarizeClassifierContentVersions([
        run({ runId: 'a', configurationSha256: 'bb' }),
        run({ runId: 'b', configurationSha256: 'cc' }),
      ]),
    )

    expect(efficiency).toMatchObject({
      contentVersions: 1,
      runs: 2,
      providerCalls: 2,
      billedRuns: 2,
      maxProviderCallsPerRun: 1,
      runsOverOneCall: 0,
      reclassifications: 1,
    })
  })

  it('surfaces a receipt that billed more than once and sorts by classifier', () => {
    const efficiency = summarizeClassifierEfficiency(
      summarizeClassifierContentVersions([
        run({ classifier: 'story-clustering', subjectId: 's1' }),
        run({ runId: 'c', subjectId: 'p2', providerCalls: 2, attemptsStarted: 2, retries: 1 }),
        run({ runId: 'd', subjectId: 'p3' }),
      ]),
    )

    expect(efficiency.map(row => row.classifier)).toEqual(['post-classifier', 'story-clustering'])
    expect(efficiency[0]).toMatchObject({
      contentVersions: 2,
      providerCalls: 3,
      maxProviderCallsPerRun: 2,
      runsOverOneCall: 1,
      reclassifications: 0,
      costMicrounits: '4000',
    })
    expect(efficiency[1]).toMatchObject({ maxProviderCallsPerRun: 1, runsOverOneCall: 0 })
  })
})
