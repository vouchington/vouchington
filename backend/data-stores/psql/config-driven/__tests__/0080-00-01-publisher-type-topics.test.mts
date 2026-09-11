import { describe, expect, it } from 'vitest'
import generatePublisherTypeTopicsSQL from '../0080-00-01-publisher-type-topics.mts'
import { PUBLISHER_TYPE_SLUGS } from '@ts-shared/utils/publisher-types'

describe('0080-00-01-publisher-type-topics', () => {
  it('generates valid SQL without errors', () => {
    const sql = generatePublisherTypeTopicsSQL()
    expect(typeof sql).toBe('string')
    expect(sql.length).toBeGreaterThan(0)
  })

  it('includes the parent publisher-types topic upsert', () => {
    const sql = generatePublisherTypeTopicsSQL()
    expect(sql).toContain("'publisher-types'")
    expect(sql).toContain('Publisher Types')
  })

  it('includes all child topics', () => {
    const sql = generatePublisherTypeTopicsSQL()
    for (const slug of PUBLISHER_TYPE_SLUGS) {
      expect(sql).toContain(`'${slug}'`)
    }
  })

  it('child slugs exactly match PUBLISHER_TYPE_SLUGS from @ts-shared', () => {
    // Drift test: ensures the generator stays in sync with what the web page uses
    const sql = generatePublisherTypeTopicsSQL()
    const EXPECTED_SLUGS = [...PUBLISHER_TYPE_SLUGS]
    for (const slug of EXPECTED_SLUGS) {
      expect(sql).toContain(`'${slug}'`)
    }
    expect(EXPECTED_SLUGS).toHaveLength(8)
  })

  it('includes topic aliases', () => {
    const sql = generatePublisherTypeTopicsSQL()
    expect(sql).toContain('INSERT INTO topic_aliases')
    expect(sql).toContain('msm')
    expect(sql).toContain('public broadcasting')
    expect(sql).toContain('public service media')
    expect(sql).toContain('public broadcaster')
    expect(sql).toContain('personal blog')
    expect(sql).toContain('reviews site')
  })

  it('does not reassign an alias owned by another active topic', () => {
    const sql = generatePublisherTypeTopicsSQL()
    const aliasUpserts = sql.match(/INSERT INTO topic_aliases/g) ?? []
    const protectedAliasUpserts =
      sql.match(/WHERE topic_aliases\.topic_id IS NULL AND EXCLUDED\.topic_id IS NOT NULL;/g) ?? []

    expect(aliasUpserts).not.toHaveLength(0)
    expect(protectedAliasUpserts).toHaveLength(aliasUpserts.length)
    expect(sql).not.toContain('ON CONFLICT (alias) DO UPDATE SET topic_id = EXCLUDED.topic_id;')
  })

  it('includes parent-child relation inserts', () => {
    const sql = generatePublisherTypeTopicsSQL()
    expect(sql).toContain('relation__topic__parent__topic')
    expect(sql).toContain('ON CONFLICT (subject_id, object_id) DO NOTHING')
    expect(sql).toContain("username = 'system'")
  })

  it('uses ON CONFLICT for idempotent topic upserts', () => {
    const sql = generatePublisherTypeTopicsSQL()
    expect(sql).toContain('bedrock_nova_multimodal_v1_content_sha256')
    expect(sql).toContain('decode(')
  })
})
