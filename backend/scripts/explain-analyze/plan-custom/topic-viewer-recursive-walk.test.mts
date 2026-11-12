import { describe, expect, it } from 'vitest'
import { buildTopicViewerDiscussionInputs } from '@services/topics/metrics-viewer-discussions'
import { validRecursiveWalk } from './topic-viewer-recursive-walk.mts'

const queryText = `WITH ${buildTopicViewerDiscussionInputs('019e0000-0400-7000-8000-000000000960', 1000).text} SELECT 1`
const specs = [
  {
    walk: 'viewer_alias_key_walk',
    relation: 'topic_aliases',
    key: /topic_id\s*=/u,
    next: /alias\s*>/u,
    first: 'topic_id = $1',
    after: 'alias > walk.alias',
  },
  {
    walk: 'viewer_direct_key_walk',
    relation: 'relation__post__category__topic',
    key: /object_id\s*=/u,
    next: /subject_id\s*>/u,
    first: 'object_id = $1',
    after: 'subject_id > walk.post_id',
  },
  {
    walk: 'viewer_alias_relation_key_walk',
    relation: 'relation__post__category__topic_alias',
    key: /object_id\s*=/u,
    next: /subject_id\s*>/u,
    first: 'object_id = alias.id',
    after: 'subject_id > walk.post_id',
  },
]
function plan(input: (typeof specs)[number]) {
  const scan = (condition: string) => ({
    'Node Type': 'Index Scan',
    'Relation Name': input.relation,
    'Index Name': 'keyed_index',
    'Index Cond': condition,
    'Actual Rows': 1,
    'Actual Loops': 1,
  })
  const limit = (child: Record<string, unknown>) => ({
    'Node Type': 'Limit',
    'Plan Rows': 1,
    Plans: [child],
  })
  return {
    'Node Type': 'Recursive Union',
    Plans: [
      limit(scan(input.first)),
      {
        'Node Type': 'Nested Loop',
        Plans: [
          { 'Node Type': 'WorkTable Scan', Filter: 'walk.inspected < $3' },
          limit(scan(`${input.first} AND ${input.after}`)),
        ],
      },
    ],
  }
}
function changeSeekLimit(walk: string, branch: 'first' | 'next', value: string): string {
  const start = queryText.indexOf(`${walk} AS (`)
  const position = branch === 'first' ? start : queryText.indexOf('UNION ALL', start)
  return (
    queryText.slice(0, position) + queryText.slice(position).replace('LIMIT 1', `LIMIT ${value}`)
  )
}

describe.each(specs)('$walk literal seek bounds', input => {
  it('accepts captured first/next literal LIMIT 1', () => {
    expect(validRecursiveWalk(plan(input), input, queryText)).toBe(true)
  })
  it.each(['first', 'next'] as const)(
    'rejects a sparse %s seek with LIMIT 1000 and estimated Plan Rows 1',
    branch => {
      expect(
        validRecursiveWalk(plan(input), input, changeSeekLimit(input.walk, branch, '1000')),
      ).toBe(false)
    },
  )
  it.each(['first', 'next'] as const)('rejects an unproven parameterized %s LIMIT', branch => {
    expect(validRecursiveWalk(plan(input), input, changeSeekLimit(input.walk, branch, '$99'))).toBe(
      false,
    )
  })
  it('rejects missing captured SQL even with estimated one-row plan limits', () => {
    expect(validRecursiveWalk(plan(input), input, '')).toBe(false)
  })
})
