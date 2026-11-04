import { describe, expect, it } from 'vitest'
import generateSeedCommunitiesSQL from '../0140-00-01-seed-communities.mts'

describe('0140-00-01-seed-communities', () => {
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
    expect(sql.match(/'system'::content_creation_channels/g)).toHaveLength(2)
    expect(sql.match(/created_by_id, created_via\)\s*\(TABLE fresh_values\)/g)).toHaveLength(2)
  })

  it('creates system owner membership only for newly inserted communities', () => {
    const sql = generateSeedCommunitiesSQL()
    const statements = sql.split(';').filter(statement => statement.trim())
    expect(statements).toHaveLength(2)
    for (const statement of statements) {
      // Fresh values are absent on replay, so replay cannot re-grant or promote a membership.
      expect(statement).toMatch(/fresh_values[\s\S]*WHERE NOT EXISTS \(SELECT 1 FROM existing\)/)
      expect(statement).toMatch(
        /INSERT INTO communities[\s\S]*\(TABLE fresh_values\)[\s\S]*RETURNING id/,
      )
      expect(statement).toMatch(
        /INSERT INTO community_members[\s\S]*SELECT inserted\.id, users\.id, 'owner'/,
      )
      expect(statement).not.toMatch(/UPDATE community_members/)
    }
  })

  it('restores soft-deleted communities', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(sql).toContain('deleted_at = NULL')
  })
})
