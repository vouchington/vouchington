import { describe, expect, it } from 'vitest'
import generateSeedTopicsSQL, { SEEDED_TOPICS } from '../0005-00-01-seed-topics.mts'

describe('0005-00-01-seed-topics idempotent', () => {
  it('generates SQL for every seeded topic', () => {
    const sql = generateSeedTopicsSQL()
    for (const topic of SEEDED_TOPICS) {
      expect(sql).toContain(topic.slug)
      expect(sql).toContain(topic.name)
    }
  })

  it('generates topic upsert with ON CONFLICT pattern', () => {
    const sql = generateSeedTopicsSQL()
    expect(sql).toContain('INSERT INTO topics')
    expect(sql).toContain('WHERE NOT EXISTS')
    expect(sql).toContain("topic_type = 'topic'")
  })

  it('generates alias inserts for aliased topics', () => {
    const sql = generateSeedTopicsSQL()
    expect(sql).toContain('INSERT INTO topic_aliases')
    expect(sql).toContain('to buy')
    expect(sql).toContain('for sale')
    expect(sql).toContain('to trade')
    expect(sql).toContain('trading')
  })

  it('does not reassign an alias owned by another active topic', () => {
    const sql = generateSeedTopicsSQL()
    const aliasUpserts = sql.match(/INSERT INTO topic_aliases/g) ?? []
    const protectedAliasUpserts =
      sql.match(/WHERE topic_aliases\.topic_id IS NULL AND EXCLUDED\.topic_id IS NOT NULL;/g) ?? []

    expect(aliasUpserts).not.toHaveLength(0)
    expect(protectedAliasUpserts).toHaveLength(aliasUpserts.length)
    expect(sql).not.toContain('ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id;')
  })

  it('includes content hash for each topic', () => {
    const sql = generateSeedTopicsSQL()
    expect(sql).toContain("decode('")
    expect(sql).toContain("', 'hex')")
  })

  it('does not include non-aliased topics in topic_aliases', () => {
    const sql = generateSeedTopicsSQL()
    // Split by voucha section to check no spurious aliases
    const vouchaSection = sql.slice(sql.indexOf("'voucha'"))
    expect(vouchaSection.slice(0, 200)).not.toContain('INSERT INTO topic_aliases')
  })

  it('SEEDED_TOPICS has all expected slugs', () => {
    const slugs = SEEDED_TOPICS.map(t => t.slug)
    expect(slugs).toContain('self-promotion')
    expect(slugs).toContain('ai-generated')
    expect(slugs).toContain('political')
    expect(slugs).toContain('click-bait')
    expect(slugs).toContain('vague-post')
    expect(slugs).toContain('shit-post')
    expect(slugs).toContain('buying')
    expect(slugs).toContain('selling')
    expect(slugs).toContain('trade')
    expect(slugs).toContain('for-hire')
    expect(slugs).toContain('hiring')
    expect(slugs).toContain('voucha')
    expect(slugs).toContain('bot')
    expect(slugs).toContain('spammer')
    expect(slugs).toHaveLength(14)
  })
})
