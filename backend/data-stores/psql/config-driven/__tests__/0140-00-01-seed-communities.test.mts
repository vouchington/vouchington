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
    const inserts = sql.match(/INSERT INTO communities \([^)]*\)\s+SELECT [^\n]*/g) ?? []

    expect(inserts).toHaveLength(2)
    for (const insert of inserts) {
      expect(insert).toMatch(/, created_via\)\s+SELECT .*, 'system'$/)
    }
  })

  it('creates system owner membership only for newly inserted communities', () => {
    const sql = generateSeedCommunitiesSQL()
    const statements = sql.split(';').filter(statement => statement.trim())
    expect(statements).toHaveLength(2)
    for (const statement of statements) {
      // New communities and their initial owner are created atomically. Replays must not
      // grant a membership or overwrite a role after an owner transfer or removal.
      expect(statement).toMatch(/inserted AS \([\s\S]*INSERT INTO communities[\s\S]*RETURNING id/)
      expect(statement).toMatch(
        /owner_membership AS \(\s*INSERT INTO community_members \(community_id, user_id, role\)\s*SELECT inserted\.id, users\.id, 'owner'\s*FROM inserted CROSS JOIN users\s*WHERE users\.username = 'system'\s*\)/,
      )
      expect(statement).not.toContain('ON CONFLICT')
      expect(statement).not.toMatch(/UPDATE community_members/)
    }
  })

  it('restores soft-deleted communities', () => {
    const sql = generateSeedCommunitiesSQL()
    expect(sql).toContain('deleted_at = NULL')
  })
})
