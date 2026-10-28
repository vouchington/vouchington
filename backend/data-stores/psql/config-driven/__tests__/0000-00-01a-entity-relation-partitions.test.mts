import { describe, expect, it } from 'vitest'
import idempotent from '../0000-00-01a-entity-relation-partitions.mts'

describe('0000-00-01a-entity-relation-partitions', () => {
  it('should generate valid SQL for entity relation partitions', () => {
    const sql = idempotent()

    expect(sql.includes('PARTITION OF') || sql.trim() === '').toBe(true)
  })

  it('generates default partition for post-subject RANGE tables', () => {
    const sql = idempotent()

    // Post-subject tables use a DEFAULT partition (no retention policy, no explicit ranges yet)
    expect(sql).toContain('PARTITION OF')
    expect(sql).toContain('__default')
  })

  it('creates child statistics for positive topic candidates', () => {
    const sql = idempotent()

    expect(sql).toContain(
      'CREATE STATISTICS IF NOT EXISTS statistics_post_category_topic_object_vote_score_mcv (mcv)\nON object_id, votes_score_net FROM relation__post__category__topic__default;',
    )
    expect(sql).toContain(
      'CREATE STATISTICS IF NOT EXISTS statistics_post_category_topic_alias_object_vote_score_mcv (mcv)\nON object_id, votes_score_net FROM relation__post__category__topic_alias__default;',
    )
  })
})
