import { describe, expect, it } from 'vitest'
import generateSeedAdminUserSQL from '../0010-00-02-seed-admin-user.mts'

describe('0010-00-02-seed-admin-user', () => {
  it('generates valid SQL without errors', () => {
    const sql = generateSeedAdminUserSQL()
    expect(typeof sql).toBe('string')
    expect(sql.length).toBeGreaterThan(0)
  })

  it('creates the jong user', () => {
    const sql = generateSeedAdminUserSQL()
    expect(sql).toContain("'jong'")
    expect(sql).toContain('vote_weight_admin_set_at')
    expect(sql).toContain('ON CONFLICT ((LOWER(username)))')
  })

  it('reclaims the jong username from any non-system squatter before upserting', () => {
    const sql = generateSeedAdminUserSQL()
    expect(sql).toContain('is_system = FALSE')
    expect(sql).toContain("reclaimed-' || replace(id::text, '-', '')")
    expect(sql).toContain('is_system = TRUE')
    // Reclaim must run before the system row is (re)created.
    expect(sql.indexOf('is_system = FALSE')).toBeLessThan(sql.indexOf('is_system = TRUE'))
  })

  it('inserts jong@voucha.ai as primary email with NOT EXISTS guard', () => {
    const sql = generateSeedAdminUserSQL()
    expect(sql).toContain('jong@voucha.ai')
    expect(sql).toContain('is_primary = TRUE')
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE')
    expect(sql).toContain("WHERE u.username = 'jong' AND u.is_system = TRUE")
  })

  it('grants administrator role only to the system-owned jong user', () => {
    const sql = generateSeedAdminUserSQL()
    expect(sql).toContain('INSERT INTO user_roles')
    expect(sql).toContain("urt.slug = 'administrator'")
    expect(sql).toContain('ON CONFLICT (user_id, role_type_id) DO NOTHING')
    expect(sql).toContain("WHERE u.username = 'jong' AND u.is_system = TRUE")
  })
})
