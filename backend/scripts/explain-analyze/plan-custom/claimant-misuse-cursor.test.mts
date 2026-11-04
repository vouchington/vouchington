import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertClaimantMisuseCursorSeek } from './claimant-misuse-cursor.mts'

function result(indexCondition: string, indexName = 'idx_copyright_notices__claimant_user') {
  return {
    name: 'copyright-claimant-misuse-near-oldest-window',
    query_text: 'SELECT id FROM copyright_notices WHERE claimant_user_id = $1 AND id < $2',
    plan: {
      Plan: {
        'Node Type': 'Limit',
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'copyright_notices',
            'Index Name': indexName,
            'Index Cond': indexCondition,
          },
        ],
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-11-04T00:00:00.000Z',
  } as ExplainResult
}

describe('claimant misuse cursor plan gate', () => {
  it.each([
    '((claimant_user_id = $1) AND (id < $2))',
    '((claimant_user_id = ANY (ARRAY[$1])) AND (id < $2))',
  ])('accepts a strict scalar id cursor seek: %s', condition => {
    expect(() => assertClaimantMisuseCursorSeek(result(condition))).not.toThrow()
  })

  it('rejects a row comparison even when it names the expected index', () => {
    expect(() =>
      assertClaimantMisuseCursorSeek(
        result(
          '((claimant_user_id = $1) AND (id < $2) AND (ROW(claimant_user_id, id) < ROW($1, $2)))',
        ),
      ),
    ).toThrow('without a ROW() comparison')
  })

  it('rejects a claimant index scan whose index condition omits the cursor', () => {
    expect(() => assertClaimantMisuseCursorSeek(result('(claimant_user_id = $1)'))).toThrow(
      'must seek id < cursor',
    )
  })

  it('rejects a scalar cursor seek through a different index', () => {
    expect(() =>
      assertClaimantMisuseCursorSeek(
        result('((claimant_user_id = $1) AND (id < $2))', 'copyright_notices_pkey'),
      ),
    ).toThrow('must seek id < cursor')
  })
})
