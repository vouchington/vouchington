import type { ExplainResult } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { assertClassifierHumanVoteComparisonPlanIfApplicable } from './plan-classifier-human-vote-comparison-gate.mts'

describe('classifier human vote comparison plan gate', () => {
  it('accepts an id-bounded index scan at the batch cap and rejects a wider scan', () => {
    expect(() =>
      assertClassifierHumanVoteComparisonPlanIfApplicable(
        result('classifier-human-vote-comparison-classifier', {
          'Node Type': 'Index Scan',
          'Relation Name': 'classifier_decision_batches',
          Alias: 'batch',
          'Index Name': 'idx_classifier_decision_batches__classifier',
          'Index Cond': '(batch.id >= $2 AND batch.id < $3)',
          'Actual Rows': 1001,
          'Actual Loops': 1,
        }),
      ),
    ).not.toThrow()

    expect(() =>
      assertClassifierHumanVoteComparisonPlanIfApplicable(
        result('classifier-human-vote-comparison-classifier', {
          'Node Type': 'Seq Scan',
          'Relation Name': 'classifier_decision_batches',
          Alias: 'batch',
          'Actual Rows': 1,
          'Actual Loops': 1,
        }),
      ),
    ).toThrow('id window')
    expect(() =>
      assertClassifierHumanVoteComparisonPlanIfApplicable(
        result('classifier-human-vote-comparison-post', {
          'Node Type': 'Index Scan',
          'Relation Name': 'classifier_decision_batches',
          Alias: 'batch',
          'Index Name': 'idx_classifier_decision_batches__post',
          'Index Cond': '(batch.id >= $2)',
          'Actual Rows': 1,
          'Actual Loops': 1,
        }),
      ),
    ).toThrow('id window')
    expect(() =>
      assertClassifierHumanVoteComparisonPlanIfApplicable(
        result('classifier-human-vote-comparison-rss-feed-item', {
          'Node Type': 'Index Scan',
          'Relation Name': 'classifier_decision_batches',
          Alias: 'batch',
          'Index Name': 'idx_classifier_decision_batches__rss_feed_item',
          'Index Cond': '(batch.id >= $2 AND batch.id < $3)',
          'Actual Rows': 1002,
          'Actual Loops': 1,
        }),
      ),
    ).toThrow('id window')
    expect(() =>
      assertClassifierHumanVoteComparisonPlanIfApplicable(
        result('review-succession-candidates', {
          'Node Type': 'Seq Scan',
          'Relation Name': 'posts',
        }),
      ),
    ).not.toThrow()
  })
})

function result(scenarioId: string, plan: Record<string, unknown>): ExplainResult {
  return {
    name: 'classifierHumanVoteComparison',
    scenario_id: scenarioId,
    query_text: 'SELECT comparison',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-03-10T00:00:00.000Z',
  }
}
