import { describe, expect, it } from 'vitest'
import {
  ANALYZE_TARGETS,
  SEEDED_ROW_COUNT_TARGETS,
  buildSeededRowCountQuery,
} from './maintenance.mts'

describe('EXPLAIN ANALYZE seed maintenance', () => {
  it('counts generated RSS feed items by seeded GUID', () => {
    const target = SEEDED_ROW_COUNT_TARGETS.find(({ table }) => table === 'rss_feed_item_ids')

    if (!target) throw new Error('Missing rss_feed_item_ids row count target')

    expect(buildSeededRowCountQuery(target)).toEqual({
      text: '/* printSeedRowCounts */ SELECT COUNT(*)::text AS count FROM "rss_feed_item_ids" WHERE "guid"::text LIKE $1',
      values: ['seed-item-guid-%'],
    })
    expect(ANALYZE_TARGETS).toContain('rss_feed_items')
  })

  it('analyzes and reports the RSS feed item source join table', () => {
    expect(ANALYZE_TARGETS).toContain('rss_feed_item_sources')
    expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual({
      table: 'rss_feed_item_sources',
      column: 'rss_feed_id',
    })
  })

  it('analyzes and reports individual cards', () => {
    expect(ANALYZE_TARGETS).toContain('individual_cards')
    expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual({
      table: 'individual_cards',
      column: 'id',
    })
  })

  it('analyzes and reports committed admission reservations for their retained post lookup', () => {
    expect(ANALYZE_TARGETS).toContain('post_admission_reservations')
    expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual({
      table: 'post_admission_reservations',
      column: 'route',
      pattern: 'explain-admission',
    })
  })

  it('analyzes and reports the deterministic support-message thread', () => {
    expect(ANALYZE_TARGETS).toContain('support_messages')
    expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual({
      table: 'support_messages',
      column: 'support_thread_id',
      pattern: '019e0000-7c00-7000-8000-000000000000',
    })
  })

  it('analyzes and reports topic import attempts for retention cleanup', () => {
    expect(ANALYZE_TARGETS).toContain('user_topic_import_attempts')
    expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual({
      table: 'user_topic_import_attempts',
      column: 'intent_sha256',
      pattern: '000%',
    })
  })

  it('analyzes and reports individual rewards program point valuations', () => {
    expect(ANALYZE_TARGETS).toContain('individual_rewards_program_point_valuations')
    expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual({
      table: 'individual_rewards_program_point_valuations',
      column: 'id',
    })
  })

  it('analyzes and reports the seeded spending category tables', () => {
    const targets = [
      { table: 'spending_entries', column: 'id' },
      { table: 'households', column: 'id' },
      { table: 'household_members', column: 'household_id' },
      { table: 'topics__spending_categories', column: 'topic_id' },
    ]

    for (const target of targets) {
      expect(ANALYZE_TARGETS).toContain(target.table)
      expect(SEEDED_ROW_COUNT_TARGETS).toContainEqual(target)
    }
  })
})
