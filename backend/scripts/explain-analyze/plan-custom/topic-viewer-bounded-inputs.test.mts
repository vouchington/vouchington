import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { getTopicsWorkLimit } from '@services/topics/work-limits'
import { buildTopicViewerDiscussionInputs } from '@services/topics/metrics-viewer-discussions'
import { assertTopicViewerInputsAreBounded } from './topic-viewer-bounded-inputs.mts'

type Node = Record<string, unknown>
const specs = [
  [
    'viewer_alias_inputs',
    'viewer_alias_key_walk',
    'topic_aliases',
    'topic_id = $1',
    'alias > walk.alias',
  ],
  [
    'viewer_direct_inputs',
    'viewer_direct_key_walk',
    'relation__post__category__topic',
    'object_id = $1',
    'subject_id > walk.post_id',
  ],
  [
    'viewer_alias_relation_inputs',
    'viewer_alias_relation_key_walk',
    'relation__post__category__topic_alias',
    'object_id = alias.id',
    'subject_id > walk.post_id',
  ],
] as const
const limit = (node: Node): Node => ({ 'Node Type': 'Limit', 'Plan Rows': 1, Plans: [node] })
function scan(relation: string, condition: string): Node {
  return {
    'Node Type': 'Index Scan',
    'Relation Name': relation,
    'Index Name': 'keyed_index',
    'Index Cond': condition,
    'Actual Rows': 1,
    'Actual Loops': 1,
  }
}
function fixture(): ExplainResult {
  const inputs: Node[] = specs.map(([cte, walk, relation, key, next]) => {
    const recursive: Node = {
      'Node Type': 'Recursive Union',
      'Subplan Name': `CTE ${walk}`,
      Plans: [
        limit(scan(relation, key)),
        {
          'Node Type': 'Nested Loop',
          Plans: [
            { 'Node Type': 'WorkTable Scan', Filter: '(walk.inspected < $3)' },
            limit(scan(relation, `${key} AND ${next}`)),
          ],
        },
      ],
    }
    const body: Node = { 'Node Type': 'Result', Plans: [recursive, { 'Node Type': 'CTE Scan' }] }
    return {
      ...limit(
        cte === 'viewer_alias_relation_inputs'
          ? { 'Node Type': 'Nested Loop', Plans: [{ 'Node Type': 'CTE Scan' }, limit(body)] }
          : body,
      ),
      'Subplan Name': `CTE ${cte}`,
      'Actual Rows': 1,
    }
  })
  for (const [cte, relation] of [
    ['viewer_review_inputs', 'post_review_topic_ratings'],
    ['viewer_data_point_inputs', 'post_data_point_topics'],
  ] as const)
    inputs.push({
      ...limit({ ...scan(relation, 'topic_id = $1'), 'Index Name': `idx_${relation}__topic_id` }),
      'Subplan Name': `CTE ${cte}`,
      'Actual Rows': 1,
      'Actual Loops': 1,
    })
  return {
    name: 'viewer-inputs',
    query_text: `WITH ${buildTopicViewerDiscussionInputs('019e0000-0400-7000-8000-000000000960', 1000).text} SELECT 1`,
    plan: { Plan: { 'Node Type': 'Result', Plans: inputs } },
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
  }
}
function nodes(result: ExplainResult): Node[] {
  const all: Node[] = []
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    const node = value as Node
    if (node['Node Type']) all.push(node)
    if (Array.isArray(node.Plans)) node.Plans.forEach(visit)
    visit(node.Plan)
  }
  visit(result.plan)
  return all
}
const aliasWalk = (result: ExplainResult) =>
  nodes(result).find(node => node['Subplan Name'] === 'CTE viewer_alias_relation_key_walk')!

describe('bounded viewer input plans', () => {
  it('accepts owned raw bounds and first/next keyed seeks', () => {
    expect(() => assertTopicViewerInputsAreBounded(fixture())).not.toThrow()
  })
  it.each(specs)('rejects %s emitting more rows than the configured input cap', cte => {
    const result = fixture()
    const raw = nodes(result).find(node => node['Subplan Name'] === `CTE ${cte}`)!
    raw['Actual Rows'] = getTopicsWorkLimit('viewer_count_input_cap') + 1
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound keyed reads')
  })
  it('accepts partition Merge Append paths below the one-row seek', () => {
    const result = fixture()
    const target = nodes(result).find(
      node => node['Relation Name'] === 'relation__post__category__topic_alias',
    )!
    Object.assign(target, {
      'Node Type': 'Merge Append',
      'Relation Name': undefined,
      Plans: [scan('relation__post__category__topic_alias__default', 'object_id = alias.id')],
    })
    expect(() => assertTopicViewerInputsAreBounded(result)).not.toThrow()
  })
  it.each(['Sort', 'Aggregate', 'Unique', 'Hash', 'Bitmap Heap Scan', 'Seq Scan'])(
    'rejects blocking/unkeyed %s beneath a seek',
    type => {
      const result = fixture()
      const walk = aliasWalk(result)
      const branches = walk.Plans as Node[]
      branches[0] = limit({ 'Node Type': type, Plans: branches[0]!.Plans })
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow(
        'relation__post__category__topic_alias',
      )
    },
  )
  it('rejects missing first-seek limits', () => {
    const result = fixture()
    ;(aliasWalk(result).Plans as Node[])[0] = scan(
      'relation__post__category__topic_alias',
      'object_id = alias.id',
    )
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow(
      'relation__post__category__topic_alias',
    )
  })
  it.each([
    'object_id = $1',
    'object_id >= $1 AND subject_id > walk.post_id',
    'object_id IS NOT NULL AND subject_id > walk.post_id',
  ])('rejects invalid recursive topic/next-key predicates: %s', condition => {
    const result = fixture()
    const target = nodes(result).find(
      node => typeof node['Index Cond'] === 'string' && node['Index Cond'].includes('subject_id >'),
    )!
    target['Index Cond'] = condition
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow(
      'relation__post__category__topic',
    )
  })
  it('rejects a recursive walk without an inspected-row counter bound', () => {
    const result = fixture()
    nodes(result)
      .filter(node => node['Node Type'] === 'WorkTable Scan')
      .forEach(node => {
        delete node.Filter
      })
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('topic_aliases')
  })
  it('rejects absent own/global bounds even under an unrelated output LIMIT', () => {
    const result = fixture()
    const root = (result.plan as { Plan: Node }).Plan
    const input = (root.Plans as Node[])[2]!
    input['Node Type'] = 'Result'
    result.plan = { Plan: limit(root) }
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow(
      'relation__post__category__topic_alias',
    )
  })
  it('does not accept sibling or stacked global limits as the per-alias bound', () => {
    const result = fixture()
    const root = (result.plan as { Plan: Node }).Plan
    const input = (root.Plans as Node[])[2]!
    input.Plans = [
      limit({
        'Node Type': 'Nested Loop',
        Plans: [aliasWalk(result), limit({ 'Node Type': 'Result' })],
      }),
    ]
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow(
      'relation__post__category__topic_alias',
    )
  })
  it('rejects eligibility joins before the raw input bound', () => {
    const result = fixture()
    ;(aliasWalk(result).Plans as Node[]).push(scan('posts__default', 'id = input.post_id'))
    expect(() => assertTopicViewerInputsAreBounded(result)).toThrow(
      'relation__post__category__topic_alias',
    )
  })
  describe.each(['viewer_review_inputs', 'viewer_data_point_inputs'])('%s physical prefix', cte => {
    function prefix(result: ExplainResult): Node {
      return nodes(result).find(node => node['Subplan Name'] === `CTE ${cte}`)!
    }
    const cap = getTopicsWorkLimit('viewer_count_input_cap')
    const budget = 2 * cap + 1
    it.each(['Index Scan', 'Index Only Scan', 'Seq Scan'])(
      'accepts a bounded %s at the fixed physical-work ceiling',
      type => {
        const result = fixture()
        const raw = prefix(result)
        raw['Actual Rows'] = cap
        Object.assign((raw.Plans as Node[])[0]!, {
          'Node Type': type,
          'Actual Rows': cap,
          'Rows Removed by Filter': cap + 1,
          Filter: 'topic_id = $1',
        })
        expect(() => assertTopicViewerInputsAreBounded(result)).not.toThrow()
      },
    )
    it.each(['Sort', 'Incremental Sort', 'Bitmap Heap Scan', 'Bitmap Index Scan'])(
      'rejects an upstream %s even when the output LIMIT is small',
      type => {
        const result = fixture()
        const raw = prefix(result)
        raw.Plans = [{ 'Node Type': type, 'Actual Rows': 1, Plans: raw.Plans }]
        expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
      },
    )
    it.each(['Actual Rows', 'Rows Removed by Filter', 'Rows Removed by Index Recheck'])(
      'counts raw %s beneath the output LIMIT',
      field => {
        const result = fixture()
        ;(prefix(result).Plans as Node[])[0]![field] = budget + 1
        expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
      },
    )
    it('multiplies underlying scan rows by loops', () => {
      const result = fixture()
      Object.assign((prefix(result).Plans as Node[])[0]!, {
        'Actual Rows': cap,
        'Actual Loops': 3,
      })
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
    })
    it('sums physical work across partition scans', () => {
      const result = fixture()
      const raw = prefix(result)
      const scanNode = (raw.Plans as Node[])[0]!
      raw.Plans = [
        {
          'Node Type': 'Append',
          Plans: [
            { ...scanNode, 'Actual Rows': cap },
            { ...scanNode, 'Actual Rows': cap, 'Rows Removed by Filter': 2 },
          ],
        },
      ]
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
    })
    it.each(['Actual Rows', 'Actual Loops'])(
      'requires measured %s on the underlying scan',
      field => {
        const result = fixture()
        delete (prefix(result).Plans as Node[])[0]![field]
        expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
      },
    )
    it.each(['post_id = $1', 'unfiltered'])('rejects a sequential scan with %s', filter => {
      const result = fixture()
      Object.assign((prefix(result).Plans as Node[])[0]!, {
        'Node Type': 'Seq Scan',
        Filter: filter,
      })
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
    })
    it('rejects an index scan without a topic-key condition', () => {
      const result = fixture()
      ;(prefix(result).Plans as Node[])[0]!['Index Cond'] = 'post_id = $1'
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
    })
    it('rejects a nonleading topic index condition with hidden index-entry work', () => {
      const result = fixture()
      ;(prefix(result).Plans as Node[])[0]!['Index Name'] = 'post_id_topic_id_pkey'
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
    })
    it('keeps the outer input LIMIT at the configured cap', () => {
      const result = fixture()
      prefix(result)['Actual Rows'] = cap + 1
      expect(() => assertTopicViewerInputsAreBounded(result)).toThrow('must bound raw reads')
    })
  })
})
