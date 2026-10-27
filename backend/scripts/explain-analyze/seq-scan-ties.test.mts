import { describe, expect, it } from 'vitest'
import { assertNoNewSeqScans, getSeqScanNearTies } from './seq-scan-baseline.mts'
import {
  costWithoutSeqScan,
  forcedSeqScan,
  isSeqScanNearTie,
  isStaleSeqScanNearTie,
  planTotalCost,
  SEQ_SCAN_TIE_RATIO,
  type ProbedExplainResult,
} from './seq-scan-ties.mts'

// The post-search-hot custom plan of merge-group run 38992808434: a Limit costing 17577.54 over a
// sequential scan of posts costing 10676.17. The passing run's bitmap plan for the same statement
// cost 18964.10, 1387 more, about 13% of that scan.
const SEQ_PLAN_COST = 17_577.54
const SEQ_SCAN_COST = 10_676.17

function seqScanResult(overrides: Partial<ProbedExplainResult> = {}): ProbedExplainResult {
  return {
    name: 'buildPostSearchQuery:force_custom_plan',
    scenario_id: 'post-search-hot',
    capture_index: 0,
    plan_cache_mode: 'force_custom_plan',
    query_text: 'SELECT 1',
    plan: {
      Plan: {
        'Node Type': 'Limit',
        'Total Cost': SEQ_PLAN_COST,
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'posts__default',
            'Total Cost': SEQ_SCAN_COST,
            'Actual Rows': 5,
            'Actual Loops': 1,
          },
        ],
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-10-17T02:08:42.856Z',
    ...overrides,
  }
}

const FINGERPRINT =
  'post-search-hot|0|buildPostSearchQuery:force_custom_plan|force_custom_plan:posts'

describe('sequential scan near-ties', () => {
  it('reads the root plan cost and ignores a missing or malformed plan', () => {
    expect(planTotalCost(seqScanResult().plan)).toBe(SEQ_PLAN_COST)
    expect(planTotalCost(null)).toBeUndefined()
    expect(planTotalCost([])).toBeUndefined()
    expect(planTotalCost({ Plan: null })).toBeUndefined()
    expect(planTotalCost({ Plan: { 'Total Cost': '1' } })).toBeUndefined()
  })

  it('prices the probe only when it avoids the sequential scan of every scanned relation', () => {
    const bitmap = {
      Plan: {
        'Node Type': 'Limit',
        'Total Cost': 18_000,
        Plans: [{ 'Node Type': 'Bitmap Heap Scan', 'Relation Name': 'posts__default' }],
      },
    }
    const stillSeq = {
      Plan: {
        'Node Type': 'Limit',
        'Total Cost': SEQ_PLAN_COST,
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default' }],
      },
    }
    const smallSeq = {
      Plan: {
        'Node Type': 'Limit',
        'Total Cost': 18_000,
        Plans: [
          { 'Node Type': 'Bitmap Heap Scan', 'Relation Name': 'posts__default' },
          { 'Node Type': 'Seq Scan', 'Relation Name': 'community_members' },
        ],
      },
    }
    expect(costWithoutSeqScan(bitmap, ['posts'])).toBe(18_000)
    // No usable index: the probe keeps the scan, so a "tie" would hide a missing index.
    expect(costWithoutSeqScan(stillSeq, ['posts'])).toBeUndefined()
    // Sequential scans of small tables are not part of the comparison.
    expect(costWithoutSeqScan(smallSeq, ['posts'])).toBe(18_000)
  })

  it('calls a scan a near-tie only when avoiding it costs a fraction of the scan', () => {
    const edge = SEQ_PLAN_COST + SEQ_SCAN_COST * SEQ_SCAN_TIE_RATIO
    expect(isSeqScanNearTie(seqScanResult())).toBe(false)
    expect(isSeqScanNearTie(seqScanResult({ no_seq_scan_total_cost: 18_964.1 }))).toBe(true)
    expect(isSeqScanNearTie(seqScanResult({ no_seq_scan_total_cost: edge }))).toBe(true)
    expect(isSeqScanNearTie(seqScanResult({ no_seq_scan_total_cost: edge + 1 }))).toBe(false)
    expect(isSeqScanNearTie(seqScanResult({ plan: {}, no_seq_scan_total_cost: 1 }))).toBe(false)
    // Whole-plan cost dilution must not turn a clear margin into a tie.
    expect(
      isSeqScanNearTie(seqScanResult({ no_seq_scan_total_cost: SEQ_PLAN_COST + SEQ_SCAN_COST })),
    ).toBe(false)
  })

  it('does not fail a new scan whose index alternative is a near-tie', () => {
    const tied = [seqScanResult({ no_seq_scan_total_cost: 18_964.1 })]
    expect(getSeqScanNearTies(tied, tied)).toEqual([FINGERPRINT])
    expect(assertNoNewSeqScans(tied, tied, {})).toEqual({ onlyFirst: [], onlyRepeated: [] })
  })

  it('still fails a new scan with a clearly more expensive index alternative', () => {
    const clear = [seqScanResult({ no_seq_scan_total_cost: SEQ_PLAN_COST + SEQ_SCAN_COST * 4 })]
    expect(getSeqScanNearTies(clear, clear)).toEqual([])
    expect(() => assertNoNewSeqScans(clear, clear, {})).toThrow(`new [${FINGERPRINT}]; stale []`)
  })

  it('still fails a new scan that was never probed', () => {
    expect(() => assertNoNewSeqScans([seqScanResult()], [seqScanResult()], {})).toThrow(
      `new [${FINGERPRINT}]; stale []`,
    )
  })

  it('still reports a baseline entry as stale when both captures lose its scan', () => {
    const fixed = [seqScanResult({ plan: { Plan: { 'Node Type': 'Result', 'Total Cost': 1 } } })]
    expect(() =>
      assertNoNewSeqScans(fixed, fixed, {
        'post-search-hot|0|buildPostSearchQuery:force_custom_plan|force_custom_plan': ['posts'],
      }),
    ).toThrow(`new []; stale [${FINGERPRINT}]`)
  })

  describe('stale baseline entries', () => {
    const IDENTITY = 'post-search-hot|0|buildPostSearchQuery:force_custom_plan|force_custom_plan'
    const baseline = { [IDENTITY]: ['posts'] }
    const INDEX_COST = 9000
    const edge = INDEX_COST + SEQ_SCAN_COST * SEQ_SCAN_TIE_RATIO
    // The chosen plan no longer scans posts; the forced plan's scan costs SEQ_SCAN_COST.
    function indexResult(forced?: { total_cost: number; scan_cost: number }): ProbedExplainResult {
      return seqScanResult({
        plan: {
          Plan: {
            'Node Type': 'Limit',
            'Total Cost': INDEX_COST,
            Plans: [{ 'Node Type': 'Index Scan', 'Relation Name': 'posts__default' }],
          },
        },
        ...(forced ? { forced_seq_scans: { posts: forced } } : {}),
      })
    }

    it('reads the forced scan only when the plan still scans the relation', () => {
      const seq = seqScanResult().plan
      expect(forcedSeqScan(seq, 'posts')).toEqual({
        total_cost: SEQ_PLAN_COST,
        scan_cost: SEQ_SCAN_COST,
      })
      expect(forcedSeqScan(seq, 'topics')).toBeUndefined()
      expect(forcedSeqScan({}, 'posts')).toBeUndefined()
    })

    it('treats a stale entry whose forced scan is a near-tie as advisory', () => {
      const tied = [indexResult({ total_cost: INDEX_COST + 500, scan_cost: SEQ_SCAN_COST })]
      expect(getSeqScanNearTies(tied, tied)).toEqual([FINGERPRINT])
      expect(assertNoNewSeqScans(tied, tied, baseline)).toEqual({ onlyFirst: [], onlyRepeated: [] })
    })

    it('draws the stale near-tie line at the ratio', () => {
      const at = indexResult({ total_cost: edge, scan_cost: SEQ_SCAN_COST })
      const over = indexResult({ total_cost: edge + 1, scan_cost: SEQ_SCAN_COST })
      expect(isStaleSeqScanNearTie(at, 'posts')).toBe(true)
      expect(isStaleSeqScanNearTie(over, 'posts')).toBe(false)
    })

    it('compares the scan nodes when the forced plan replans unrelated joins', () => {
      // Run 40427732470: index-only scan 318.09 against a forced seq scan 321.88, while the
      // forced plan's total was inflated by disabled index paths elsewhere in the statement.
      const indexed = (scanCost: number) =>
        seqScanResult({
          plan: {
            Plan: {
              'Node Type': 'Limit',
              'Total Cost': INDEX_COST,
              Plans: [
                {
                  'Node Type': 'Index Only Scan',
                  'Relation Name': 'posts__default',
                  'Total Cost': scanCost,
                },
              ],
            },
          },
          forced_seq_scans: { posts: { total_cost: INDEX_COST * 1e6, scan_cost: SEQ_SCAN_COST } },
        })
      expect(isStaleSeqScanNearTie(indexed(SEQ_SCAN_COST - 3), 'posts')).toBe(true)
      expect(isStaleSeqScanNearTie(indexed(SEQ_SCAN_COST * 0.75), 'posts')).toBe(true)
      expect(isStaleSeqScanNearTie(indexed(SEQ_SCAN_COST * 0.74), 'posts')).toBe(false)
    })

    it('still fails a stale entry whose forced scan costs clearly more', () => {
      const clear = [indexResult({ total_cost: INDEX_COST * 3, scan_cost: SEQ_SCAN_COST })]
      expect(() => assertNoNewSeqScans(clear, clear, baseline)).toThrow(
        `new []; stale [${FINGERPRINT}]`,
      )
    })

    it('still fails a stale entry whose forced plan does not reproduce the scan', () => {
      const unforced = [indexResult()]
      expect(isStaleSeqScanNearTie(unforced[0], 'posts')).toBe(false)
      expect(isStaleSeqScanNearTie(seqScanResult({ plan: {} }), 'posts')).toBe(false)
      expect(() => assertNoNewSeqScans(unforced, unforced, baseline)).toThrow(
        `new []; stale [${FINGERPRINT}]`,
      )
    })
  })
})
