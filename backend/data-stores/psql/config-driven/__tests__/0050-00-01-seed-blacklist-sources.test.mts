import { describe, expect, it } from 'vitest'
import generateSeedBlacklistSourcesSQL, {
  generateSQL,
} from '../0050-00-01-seed-blacklist-sources.mts'
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

  it('uses ON CONFLICT (name) for idempotency', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(sql).toContain('ON CONFLICT (name) DO UPDATE SET')
    expect(sql).toContain('type = EXCLUDED.type')
    expect(sql).toContain('url = EXCLUDED.url')
  })

  it('does not touch etag or last_fetched_at', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(sql).not.toContain('etag')
    expect(sql).not.toContain('last_fetched_at')
  })

  it('inserts into domain_blacklist_sources', () => {
    const sql = generateSeedBlacklistSourcesSQL()
    expect(sql).toContain('INSERT INTO domain_blacklist_sources')
    expect(sql).toContain('(type, name, url)')
  })

  it('returns only the header comment when blacklists is empty', () => {
    const sql = generateSQL([])
    expect(sql).toBe('-- Seed domain blacklist sources')
    expect(sql).not.toContain('INSERT')
  })
})
