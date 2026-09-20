import { describe, expect, it } from 'vitest'
import createClassifierResultPartitions from '../0635-00-01-classifier-result-partitions.mts'

describe('createClassifierResultPartitions', () => {
  it('creates default children for classifier snapshot and result parents', () => {
    const sql = createClassifierResultPartitions()

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS classifier_decision_batch_candidates__default',
    )
    expect(sql).toContain('PARTITION OF classifier_decision_batch_candidates DEFAULT')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS topic_classifier_results__default')
    expect(sql).toContain('PARTITION OF topic_classifier_results DEFAULT')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS story_classifier_results__default')
    expect(sql).toContain('PARTITION OF story_classifier_results DEFAULT')
  })
})
