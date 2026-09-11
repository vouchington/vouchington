import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertTopicViewerCountsDiscussionsUsesCandidateBind } from './plan-topic-viewer-counts-gate.mts'

function result(scenarioId: string, queryText: string, plan: unknown): ExplainResult {
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    query_text: queryText,
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

// count__reviews and count__data_points never touch the topic relation, but real EXPLAIN output
// aliases their own `posts` access `candidate_post` too (Postgres does not rename repeated aliases
// across sibling scalar subqueries) -- present in every fixture below to prove the gate does not
// require *every* candidate_post access to reference subject_id, only the discussions one.
const UNRELATED_REVIEWS_SIBLING = {
  'Node Type': 'Aggregate',
  Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default', Alias: 'candidate_post' }],
}

const UNRELATED_DATA_POINTS_SIBLING = {
  'Node Type': 'Aggregate',
  Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default', Alias: 'candidate_post' }],
}

describe('assertTopicViewerCountsDiscussionsUsesCandidateBind', () => {
  it('accepts the candidate-bind shape (posts probed from the topic-relation side)', () => {
    const candidateBind = result('topic-viewer-counts', '/* getTopicViewerCounts */ SELECT …', {
      Plan: {
        'Node Type': 'Result',
        Plans: [
          {
            'Node Type': 'Aggregate',
            Plans: [
              {
                'Node Type': 'Nested Loop',
                Plans: [
                  {
                    'Node Type': 'Append',
                    Plans: [
                      {
                        'Node Type': 'Index Scan',
                        'Relation Name': 'relation__post__category__topic__default',
                        Alias: 'rel',
                        'Index Cond': '(object_id = $1)',
                      },
                      {
                        'Node Type': 'Nested Loop',
                        'Join Filter': '(alias_relation.object_id = alias.id)',
                        Plans: [
                          {
                            'Node Type': 'Index Scan',
                            'Relation Name': 'topic_aliases',
                            Alias: 'alias',
                            'Index Cond': '(topic_id = $1)',
                          },
                          {
                            // Small table: the planner omits an Index Cond here and applies the
                            // join filter at the parent Nested Loop instead. This must not be
                            // required to carry its own Index Cond -- only *a* topic-relation
                            // access (the direct one above) needs to be indexed.
                            'Node Type': 'Index Scan',
                            'Relation Name': 'relation__post__category__topic_alias__default',
                            Alias: 'alias_relation',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'posts__default',
                    Alias: 'candidate_post',
                    'Index Cond': '(id = rel.subject_id)',
                  },
                ],
              },
            ],
          },
          UNRELATED_REVIEWS_SIBLING,
          UNRELATED_DATA_POINTS_SIBLING,
        ],
      },
    })
    expect(() => assertTopicViewerCountsDiscussionsUsesCandidateBind(candidateBind)).not.toThrow()
  })

  it('rejects the correlated-EXISTS shape (posts scanned by post_type, topic checked per row)', () => {
    const correlatedExists = result('topic-viewer-counts', '/* getTopicViewerCounts */ SELECT …', {
      Plan: {
        'Node Type': 'Result',
        Plans: [
          {
            'Node Type': 'Aggregate',
            Plans: [
              {
                'Node Type': 'Nested Loop',
                Plans: [
                  {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'posts__default',
                    Alias: 'candidate_post',
                    'Index Cond': "(post_type = 'discussion'::post_types)",
                    Plans: [
                      {
                        'Node Type': 'Append',
                        Plans: [
                          {
                            'Node Type': 'Index Scan',
                            'Relation Name': 'relation__post__category__topic__default',
                            Alias: 'rel',
                            'Index Cond': '(object_id = $1 AND subject_id = candidate_post.id)',
                          },
                          {
                            'Node Type': 'Nested Loop',
                            Plans: [
                              {
                                'Node Type': 'Index Scan',
                                'Relation Name': 'relation__post__category__topic_alias__default',
                                Alias: 'alias_rel',
                                'Index Cond': '(subject_id = candidate_post.id)',
                              },
                              {
                                'Node Type': 'Index Scan',
                                'Relation Name': 'topic_aliases',
                                Alias: 'alias',
                                'Index Cond': '(topic_id = $1)',
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          UNRELATED_REVIEWS_SIBLING,
        ],
      },
    })
    expect(() => assertTopicViewerCountsDiscussionsUsesCandidateBind(correlatedExists)).toThrow(
      'must drive count__discussions from the topic-side relation into posts',
    )
  })

  it('accepts a Bitmap Heap Scan on the topic relation backed by a constrained Bitmap Index Scan', () => {
    const bitmapIndexedRelation = result(
      'topic-viewer-counts',
      '/* getTopicViewerCounts */ SELECT …',
      {
        Plan: {
          'Node Type': 'Result',
          Plans: [
            {
              'Node Type': 'Aggregate',
              Plans: [
                {
                  'Node Type': 'Nested Loop',
                  Plans: [
                    {
                      'Node Type': 'Bitmap Heap Scan',
                      'Relation Name': 'relation__post__category__topic__default',
                      Alias: 'rel',
                      'Recheck Cond': '(object_id = $1)',
                      Plans: [
                        {
                          'Node Type': 'Bitmap Index Scan',
                          'Index Cond': '(object_id = $1)',
                        },
                      ],
                    },
                    {
                      'Node Type': 'Index Scan',
                      'Relation Name': 'posts__default',
                      Alias: 'candidate_post',
                      'Index Cond': '(id = rel.subject_id)',
                    },
                  ],
                },
              ],
            },
            UNRELATED_REVIEWS_SIBLING,
          ],
        },
      },
    )
    expect(() =>
      assertTopicViewerCountsDiscussionsUsesCandidateBind(bitmapIndexedRelation),
    ).not.toThrow()
  })

  it('rejects a plan whose topic-relation accesses are all unindexed', () => {
    const unindexedRelation = result('topic-viewer-counts', '/* getTopicViewerCounts */ SELECT …', {
      Plan: {
        'Node Type': 'Result',
        Plans: [
          {
            'Node Type': 'Aggregate',
            Plans: [
              {
                'Node Type': 'Nested Loop',
                Plans: [
                  {
                    'Node Type': 'Seq Scan',
                    'Relation Name': 'relation__post__category__topic__default',
                    Alias: 'rel',
                  },
                  {
                    'Node Type': 'Index Scan',
                    'Relation Name': 'posts__default',
                    Alias: 'candidate_post',
                    'Index Cond': '(id = rel.subject_id)',
                  },
                ],
              },
            ],
          },
          UNRELATED_REVIEWS_SIBLING,
        ],
      },
    })
    expect(() => assertTopicViewerCountsDiscussionsUsesCandidateBind(unindexedRelation)).toThrow(
      'must resolve the topic-side candidate relation through an indexed lookup',
    )
  })

  it('ignores a topic-viewer-counts capture that does not call getTopicViewerCounts', () => {
    const unrelated = result('topic-viewer-counts', 'SELECT id FROM topics', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'topics' },
    })
    expect(() => assertTopicViewerCountsDiscussionsUsesCandidateBind(unrelated)).not.toThrow()
  })

  it('ignores an unrelated scenario capture', () => {
    const unrelated = result('search-communities', '/* getTopicViewerCounts */ SELECT …', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'posts', Alias: 'candidate_post' },
    })
    expect(() => assertTopicViewerCountsDiscussionsUsesCandidateBind(unrelated)).not.toThrow()
  })
})
