import { describe, expect, it } from 'vitest'
import createClassifierResultPartitions from '../0635-00-01-classifier-result-partitions.mts'

describe('createClassifierResultPartitions', () => {
  it('creates default children for topic and story result parents', () => {
    const sql = createClassifierResultPartitions()

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS topic_classifier_results__default')
    expect(sql).toContain('PARTITION OF topic_classifier_results DEFAULT')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS story_classifier_results__default')
    expect(sql).toContain('PARTITION OF story_classifier_results DEFAULT')
  })
})
