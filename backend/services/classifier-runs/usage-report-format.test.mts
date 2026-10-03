import { classifierRunUsage as run } from '@voucha/test-helpers/classifier-run-usage'
import { describe, expect, it } from 'vitest'
import { formatClassifierUsageReport } from './usage-report-format.mts'
import {
  summarizeClassifierContentVersions,
  summarizeClassifierEfficiency,
} from './usage-report-efficiency.mts'
import type { ClassifierRunUsage, ClassifierUsageReport } from './usage-report-types.mts'

/** A run that billed nothing: a local-only run, or a replay that never reached the provider. */
const UNBILLED: Partial<ClassifierRunUsage> = {
  providerCalls: 0,
  attemptsStarted: 0,
  costMicrounits: '0',
  latencyMsTotal: 0,
  latencyMsMax: null,
  latencySamples: 0,
}

function reportOf(
  runs: ClassifierRunUsage[],
  requests: Record<string, number> = {},
  classifiers: string[] = [],
): ClassifierUsageReport {
  const contentVersions = summarizeClassifierContentVersions(runs)
  return {
    window: {
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-02T00:00:00.000Z'),
    },
    runs,
    groups: [],
    contentVersions,
    efficiency: summarizeClassifierEfficiency(contentVersions),
    requests,
    classifiers,
  }
}

describe('formatClassifierUsageReport (deterministic fixtures)', () => {
  it('says so when no run was reserved in the window', () => {
    expect(formatClassifierUsageReport(reportOf([]))).toBe(
      'Classifier call efficiency: runs reserved 2026-10-01T00:00:00.000Z to 2026-10-02T00:00:00.000Z\n\nNo classifier runs were reserved.\n',
    )
  })

  it('states that the KPI holds with the cost, latency and calls per content version', () => {
    const text = formatClassifierUsageReport(
      reportOf([run({ runId: 'a' }), run({ runId: 'b', subjectId: 'other', ...UNBILLED })], {
        'post-classifier': 7,
      }),
    )

    expect(text).toContain('KPI (at most one billed call per receipt): holds')
    expect(text).toContain('calls per content version: 0 calls: 1, 1 call: 1, 2+ calls: 0')
    expect(text).toContain('cost $0.002000, latency 200 ms mean over 1 calls')
    expect(text).toContain(
      'diagnostic only: 7 requested content versions, 0 sweep re-enqueues of unfinished runs',
    )
    expect(text).not.toContain('receipts over one call')
  })

  it('lists a classifier that has requests but reserved no run in the window', () => {
    const text = formatClassifierUsageReport(
      reportOf([run({ runId: 'a' })], { 'story-clustering': 4, 'post-classifier': 1 }),
    )

    expect(text).toContain(
      'story-clustering\n  no run was reserved in the window\n  diagnostic only: 4 requested content versions\n',
    )
    expect(text).toContain('diagnostic only: 1 requested content versions, 0 sweep re-enqueues')
    expect(text.indexOf('post-classifier')).toBeLessThan(text.indexOf('story-clustering'))
  })

  it('still lists request-only classifiers when no run was reserved at all', () => {
    const text = formatClassifierUsageReport(reportOf([], { 'story-clustering': 2 }))

    expect(text).toContain('No classifier runs were reserved.')
    expect(text).toContain('story-clustering\n  no run was reserved in the window')
  })

  it('lists a catalog classifier with no requests and no runs instead of hiding it', () => {
    const text = formatClassifierUsageReport(
      reportOf([run({ runId: 'a' })], { 'story-clustering': 4 }, [
        'tagging',
        'post-classifier',
        'community-moderation',
        'story-clustering',
      ]),
    )

    expect(text).toContain('community-moderation\n  no requests and no runs in the window\n')
    expect(text).toContain('tagging\n  no requests and no runs in the window\n')
    expect(text).toContain('story-clustering\n  no run was reserved in the window')
    expect(text.indexOf('community-moderation')).toBeLessThan(text.indexOf('story-clustering'))
    expect(text.indexOf('story-clustering')).toBeLessThan(text.indexOf('tagging'))
    expect(text.match(/^post-classifier$/gm)).toHaveLength(1)
  })

  it('lists the whole catalog as silent when the window has nothing at all', () => {
    const text = formatClassifierUsageReport(reportOf([], {}, ['post-classifier']))

    expect(text).toContain('No classifier runs were reserved.')
    expect(text).toContain('post-classifier\n  no requests and no runs in the window\n')
  })

  it('does not call the KPI settled while a run is unfinished', () => {
    const text = formatClassifierUsageReport(
      reportOf([
        run({ runId: 'a' }),
        run({ runId: 'b', subjectId: 'other', outcome: 'incomplete' }),
        run({ runId: 'c', subjectId: 'third', outcome: 'incomplete' }),
      ]),
    )

    expect(text).toContain(
      'KPI (at most one billed call per receipt): INCONCLUSIVE (no breach so far, 2 unfinished runs can still call the provider)',
    )
    expect(text).not.toContain('): holds')
    expect(text).not.toContain('BREACHED')
  })

  it('keeps a breach final even while another run is unfinished', () => {
    const text = formatClassifierUsageReport(
      reportOf([
        run({ runId: 'a', providerCalls: 2 }),
        run({ runId: 'b', subjectId: 'other', outcome: 'incomplete' }),
      ]),
    )

    expect(text).toContain('KPI (at most one billed call per receipt): BREACHED')
    expect(text).not.toContain('INCONCLUSIVE')
  })

  it('states the cost as a floor when the ledger could not price a billed call', () => {
    const text = formatClassifierUsageReport(
      reportOf([run({ runId: 'a', unpricedCalls: 1 }), run({ runId: 'b', subjectId: 'other' })]),
    )

    expect(text).toContain('cost at least $0.004000 (excludes 1 unpriced billed calls), latency')
  })

  it('lists a receipt that billed twice as a breach', () => {
    const text = formatClassifierUsageReport(
      reportOf([run({ providerCalls: 2, costMicrounits: '4000', subjectId: 'post-9' })]),
    )

    expect(text).toContain('KPI (at most one billed call per receipt): BREACHED')
    expect(text).toContain('receipts over one call:\n  post post-9 input aa: 1 runs, 2 calls')
    expect(text).toContain('cost $0.004000')
  })

  it('lists re-classified content and summarizes the versions past the listing limit', () => {
    const runs = Array.from({ length: 12 }, (_, index) => [
      run({ runId: `a${index}`, subjectId: `post-${index}`, configurationSha256: 'bb' }),
      run({ runId: `b${index}`, subjectId: `post-${index}`, configurationSha256: 'cc' }),
    ]).flat()
    const text = formatClassifierUsageReport(reportOf(runs))

    expect(text).toContain('re-classifications (configuration changed): 12')
    expect(text).toContain('re-classified content:')
    expect(text).toContain('  ... and 2 more')
    expect(text).toContain('KPI (at most one billed call per receipt): holds')
  })

  it('reports no latency samples and local-only runs without a cost', () => {
    const text = formatClassifierUsageReport(
      reportOf([run({ ...UNBILLED, localDetector: 'detector' })]),
    )

    expect(text).toContain('latency no samples')
    expect(text).toContain('local detector runs (never billed): 1')
    expect(text).toContain('cost $0.000000')
  })
})
