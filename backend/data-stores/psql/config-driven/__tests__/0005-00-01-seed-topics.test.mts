import { getSeededTopicEmbeddingIdentities } from '@voucha/test-helpers/seeded-topic-embedding-identity'
import { createTopicEmbeddingContent } from '@voucha/types/entities/topic'
import { describe, expect, it } from 'vitest'
import generateSeedTopicsSQL from '../0005-00-01-seed-topics.mts'
import { SEEDED_TOPICS } from '../utils/seeded-topics.mts'

describe('0005-00-01-seed-topics idempotent', () => {
  it('bootstraps canonical stored hashes from actual projected aliases', async () => {
    const slugs = [
      ...new Set([
        ...SEEDED_TOPICS.map(topic => topic.slug),
        'amex-referral-program',
        'publisher-types',
        'mainstream-media',
        'public-media',
      ]),
    ]
    const rows = await getSeededTopicEmbeddingIdentities(slugs)
    expect(rows.map(row => row.slug).toSorted()).toEqual(slugs.toSorted())
    expect(rows.find(row => row.slug === 'mainstream-media')?.aliases).toContain('msm')
    for (const row of rows) {
      expect(row.created_via).toBe('system')
      expect(row.content_sha256).toEqual(
        createTopicEmbeddingContent({
          name: row.name,
          aliases: row.aliases,
          markdown: row.markdown ?? '',
        }).content_sha256,
      )
    }
  })

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
      sql.match(
        /WHERE topic_aliases\.unlink_requested_at IS NULL\n {2}AND topic_aliases\.topic_id IS NULL AND EXCLUDED\.topic_id IS NOT NULL;/g,
      ) ?? []

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
})
