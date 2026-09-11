import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertTopicImportAttemptPlanShape } from './plan-topic-import-attempts-gate.mts'

function result(scenarioId: string, queryText: string, plan: unknown): ExplainResult {
  return {
    name: 'topic-import-attempts',
    scenario_id: scenarioId,
    query_text: queryText,
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('topic import attempt plan gate', () => {
  it.each([
    [
      'topic-import-attempts-retention',
      '/* pruneExpiredTopicImportAttempts */ DELETE FROM user_topic_import_attempts',
      'idx_user_topic_import_attempts__retention',
    ],
    [
      'topic-import-attempts-user-key',
      '/* claimTopicImportAttempt.get */ SELECT FROM user_topic_import_attempts',
      'user_topic_import_attempts_user_key_unique',
    ],
  ])('requires %s to use its index', (scenarioId, queryText, indexName) => {
    const indexed = result(scenarioId, queryText, {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'user_topic_import_attempts',
        'Index Name': indexName,
      },
    })
    expect(() => assertTopicImportAttemptPlanShape(indexed)).not.toThrow()

    const scanned = result(scenarioId, queryText, {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'user_topic_import_attempts' },
    })
    expect(() => assertTopicImportAttemptPlanShape(scanned)).toThrow(indexName)
  })

  it('rejects an unknown scenario instead of guessing from query text', () => {
    expect(() =>
      assertTopicImportAttemptPlanShape(
        result('unknown', '/* pruneExpiredTopicImportAttempts */', { Plan: {} }),
      ),
    ).toThrow('Unknown topic import attempt plan scenario')
  })
})
