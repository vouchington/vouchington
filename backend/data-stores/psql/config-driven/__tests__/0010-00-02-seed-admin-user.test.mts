import { describe, expect, it } from 'vitest'
import generateSeedAdminUserSQL from '../0010-00-02-seed-admin-user.mts'

const configured = { emailAddress: ' Tests+Administrator@Example.test ' }

describe('administrator seed configuration', () => {
  it('reserves the official identity without email or administrator authority when unset', () => {
    const sql = generateSeedAdminUserSQL({ emailAddress: '' })
    expect(sql).toContain("platform_account_kind = 'official'")
    expect(sql).toContain("'jong'")
    expect(sql).not.toContain('INSERT INTO user_email_addresses')
    expect(sql).not.toContain('INSERT INTO user_roles')
  })

  it('uses the normalized configured address and its domain', () => {
    const sql = generateSeedAdminUserSQL(configured)
    expect(sql).toContain("'tests+administrator@example.test'")
    expect(sql).toContain("email_domain.hostname = 'example.test'")
    expect(sql).toContain("urt.slug = 'administrator'")
    expect(sql).toContain('ON CONFLICT (user_id, role_type_id) DO NOTHING')
    expect(sql).toContain("WHERE u.username = 'jong' AND u.platform_account_kind = 'official'")
  })

  it('quotes accepted apostrophes as data in SQL literals', () => {
    const sql = generateSeedAdminUserSQL({ emailAddress: "tests+o'hara@example.test" })
    expect(sql).toContain("'tests+o''hara@example.test'")
    expect(sql).not.toContain("'tests+o'hara@example.test'")
  })

  it.each(['not-an-address', 'test@example.test; SELECT 1', 'test@invalid domain.test'])(
    'rejects invalid configured addresses: %s',
    emailAddress => {
      expect(() => generateSeedAdminUserSQL({ emailAddress })).toThrow(
        'ADMIN_EMAIL_ADDRESS must be a valid email address',
      )
    },
  )
})
