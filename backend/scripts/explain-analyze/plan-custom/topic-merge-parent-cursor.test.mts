import type { ExplainResult } from '@vouchington/explain-plan'
import { describe, expect, it } from 'vitest'
import { assertTopicMergeParentCursorSeek } from './topic-merge-parent-cursor.mts'

function result({
  captureIndex = 1,
  indexName = 'relation__topic__parent__topic_pkey',
  indexCondition,
  filter,
}: {
  captureIndex?: number
  indexName?: string
  indexCondition: string
  filter?: string
}) {
  return {
    name: 'pageTopicMergeParentEdges:force_generic_plan',
    scenario_id: 'topic-merge-parent-preflight-at-cap',
    capture_index: captureIndex,
    query_text: 'topic-merge-parent-preflight-at-cap fixture',
    plan: {
      Plan: {
        'Node Type': 'Limit',
        Plans: [
          {
            'Node Type': 'Index Only Scan',
            'Relation Name': 'relation__topic__parent__topic',
            'Index Name': indexName,
            'Index Cond': indexCondition,
            ...(filter === undefined ? {} : { Filter: filter }),
          },
        ],
      },
    },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-11-28T00:00:00.000Z',
  } as ExplainResult
}

describe('topic merge parent cursor plan gate', () => {
  it.each([
    '((subject_id = $1) AND (object_id > $2))',
    "((subject_id = '01a2236d-385d-7905-bedd-198921397ca2'::uuid) AND (object_id > '01a2236d-3861-77d1-957b-e0cc77a3a124'::uuid))",
  ])(
    'accepts a scalar continuation seek in the primary key index condition: %s',
    indexCondition => {
      expect(() => assertTopicMergeParentCursorSeek(result({ indexCondition }))).not.toThrow()
    },
  )

  it('ignores the first-page capture', () => {
    expect(() =>
      assertTopicMergeParentCursorSeek(
        result({ captureIndex: 0, indexCondition: '(subject_id = $1)' }),
      ),
    ).not.toThrow()
  })

  it('rejects a ROW() comparison even on the expected index', () => {
    expect(() =>
      assertTopicMergeParentCursorSeek(
        result({
          indexCondition: '((ROW(subject_id, object_id) > ROW($1, $2)) AND (subject_id = $1))',
        }),
      ),
    ).toThrow('without a ROW() comparison or residual filter')
  })

  it('rejects a generic continuation that leaves the cursor in a residual filter', () => {
    expect(() =>
      assertTopicMergeParentCursorSeek(
        result({
          indexCondition: '(subject_id = $1)',
          filter: '(($2 IS NULL) OR (object_id > $2))',
        }),
      ),
    ).toThrow('must seek subject_id and object_id > cursor')
  })

  it('rejects a continuation scan that still carries a residual filter', () => {
    expect(() =>
      assertTopicMergeParentCursorSeek(
        result({
          indexCondition: '((subject_id = $1) AND (object_id > $2))',
          filter: '(deleted_at IS NULL)',
        }),
      ),
    ).toThrow('without a ROW() comparison or residual filter')
  })

  it('rejects a seek on a different index', () => {
    expect(() =>
      assertTopicMergeParentCursorSeek(
        result({
          indexName: 'idx_relation__topic__parent__topic__reverse_index',
          indexCondition: '((subject_id = $1) AND (object_id > $2))',
        }),
      ),
    ).toThrow('relation__topic__parent__topic_pkey')
  })
})
