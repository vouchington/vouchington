import { describe, expect, it } from 'vitest'
import generateSeedCommunitiesSQL from '../0140-00-01-seed-communities.mts'

describe('0140-00-01-seed-communities', () => {
  it('generates valid SQL without errors', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(typeof sql).toBe('string')
    expect(sql.length).toBeGreaterThan(0)
  })

  it('upserts both expected communities', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(sql).toContain("'voucha-quality-filters'")
    expect(sql).toContain("'voucha-platform'")
    expect(sql).toContain('Voucha Quality Filters')
    expect(sql).toContain('Voucha Platform')
  })

  it('uses system user as owner', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(sql).toContain("username = 'system'")
  })

  it('records seeded communities as platform-created content', () => {
    const sql = generateSeedCommunitiesSQL()
    const inserts = sql.match(/INSERT INTO communities \([^)]*\)\s+SELECT [^\n]*/g) ?? []

    expect(inserts).toHaveLength(2)
    for (const insert of inserts) {
      expect(insert).toMatch(/, created_via\)\s+SELECT .*, 'system'$/)
    }
  })

  it('inserts owner membership with ON CONFLICT', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(sql).toContain('INSERT INTO community_members')
    expect(sql).toContain("'owner'")
    expect(sql).toContain('removed_at IS NULL')
    expect(sql).toContain('DO UPDATE SET role')
  })

  it('restores soft-deleted communities', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(sql).toContain('deleted_at = NULL')
  })
})
