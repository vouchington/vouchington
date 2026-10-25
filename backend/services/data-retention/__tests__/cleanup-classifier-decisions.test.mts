import { describe, expect, it } from 'vitest'
import type { OwnedTransaction } from '@data-stores/psql'
import type { SQLStatement } from 'sql-template-strings'
import {
  deleteOldClassifierBatches,
  deleteOldClassifierCalls,
} from '../cleanup-classifier-decisions.mts'

describe('classifier decision parent retention', () => {
  it('keeps calls and batches while any live run, result, or child still references them', async () => {
    const statements: SQLStatement[] = []
    const query = (async (statement: SQLStatement) => {
      statements.push(statement)
      return { rowCount: 0, rows: [] }
    }) as unknown as OwnedTransaction
    const ids = ['00000000-0000-7000-8000-000000000001']

    expect(await deleteOldClassifierCalls(query, ids)).toBe(0)
    expect(await deleteOldClassifierBatches(query, ids)).toBe(0)
    expect(statements).toHaveLength(2)
    const [calls, batches] = statements
    for (const statement of [calls!, batches!]) {
      expect(statement.text).toContain('FROM classifier_runs run')
      for (const table of [
        'topic_classifier_results',
        'story_classifier_results',
        'community_prompt_classifier_results',
      ]) {
        expect(statement.text).toContain(`FROM ${table} result`)
      }
      expect(statement.values).toEqual([ids])
    }
    expect(batches!.text).toContain('FROM classifier_runs run')
    expect(batches!.text).toContain('FROM classifier_decision_calls call')
    expect(batches!.text).toContain('FROM classifier_decision_batch_candidates candidate')
  })
})
