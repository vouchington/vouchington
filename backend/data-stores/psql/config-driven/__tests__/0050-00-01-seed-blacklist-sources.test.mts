import { describe, expect, it } from 'vitest'
import generateSeedBlacklistSourcesSQL from '../0050-00-01-seed-blacklist-sources.mts'
import { generateSQL } from '../utils/blacklist-source-seed-sql.mts'
import { BLACKLISTS } from '@voucha/types/entities/domain-blacklist-source'

describe('0050-00-01-seed-blacklist-sources', () => {
  it('generates valid SQL without errors', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(typeof sql).toBe('string')
    expect(sql.length).toBeGreaterThan(0)
  })

  it('includes all blacklist sources', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    for (const source of BLACKLISTS) {
      expect(sql).toContain(source.name)
    }
  })

  it('inserts safely and only updates changed source metadata', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(sql).toContain('ON CONFLICT (name) DO NOTHING')
    expect(sql).toContain('source.type IS DISTINCT FROM input.type::domain_blocklist_types')
    expect(sql).toContain('source.url IS DISTINCT FROM input.url')
  })

  it('clears conditional headers on source changes but preserves fetch history', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(sql).toContain('etag = NULL')
    expect(sql).toContain('last_modified_at = NULL')
    expect(sql).not.toContain('last_fetched_at')
  })

  it('inserts into domain_blocklist_sources', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(sql).toContain('INSERT INTO domain_blocklist_sources')
    expect(sql).toContain('(type, name, url)')
  })

  it('returns only the header comment when blacklists is empty', () => {
    const sql = generateSQL([])
    expect(sql).toBe('-- Seed domain blacklist sources')
    expect(sql).not.toContain('INSERT')
  })
})
