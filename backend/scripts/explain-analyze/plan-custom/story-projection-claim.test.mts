import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertStoryProjectionClaimCandidates } from './story-projection-claim.mts'

function capturedSort(type: 'Sort' | 'Incremental Sort', rows: number, loops = 1): ExplainResult {
  return {
    name: 'claimStoryPostRelatedUrlProjectionWork',
    query_text: 'SELECT 1',
    plan: {
      Plan: {
        'Node Type': type,
        'Actual Rows': 1,
        'Actual Loops': 1,
        'Sort Method': 'top-N heapsort',
        Plans: [{ 'Node Type': 'Append', 'Actual Rows': rows, 'Actual Loops': loops }],
      },
    },
    execution_time_ms: 0,
    planning_time_ms: 0,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}

describe('story projection claim candidate sorts', () => {
  it('accepts sorting the one measured claim candidate', () => {
    for (const type of ['Sort', 'Incremental Sort'] as const)
      expect(() => assertStoryProjectionClaimCandidates(capturedSort(type, 1))).not.toThrow()
  })

  it('rejects larger input even when a top-N sort emits only one winner', () => {
    for (const [rows, loops] of [
      [2, 1],
      [4, 1],
      [100000, 1],
      [1, 2],
    ] as const)
      expect(() => assertStoryProjectionClaimCandidates(capturedSort('Sort', rows, loops))).toThrow(
        'must sort at most one claim candidate from its input',
      )
  })
})
