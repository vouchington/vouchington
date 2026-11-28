import { describe, expect, it } from 'vitest'
import {
  createLocalTestUserWithUsername,
  getLocalTestUserRaw,
  getLocalTestUserRawByUsername,
  countLocalUserRoleAssignments,
  countAllLocalUserRoleAssignments,
  localSafeUsername,
  countLocalRetainedRootsFromCurrentUserVersion,
} from '../../../../test-helpers/data-stores/psql/users.mts'
import {
  isLocalPrimaryEmailForUser,
  addLocalSecondaryEmailsForUser,
  countLocalEmailsForUser,
} from '../../../../test-helpers/data-stores/psql/email-addresses.mts'
import { runConfigDrivenStatementsInTransaction } from '@vouchington/postgres'
import { beginTransaction } from '@voucha/test-helpers'
import { buildSystemUserUpsertSQL, buildSeedAdminUserSQL } from '../utils/system-user-seed.mts'
import generateSeedAdminUserSQL from '../0010-00-02-seed-admin-user.mts'

// Any authenticated user can rename themselves via PATCH /api/v1/my/identity (no reserved-name
// list at that layer), and db:migrate reruns these generators on every deploy, granting
// privileged roles by username lookup. These tests execute the REAL generated SQL against a live
// database (not string-matching, see the sibling __tests__ files for that) to prove the
// reclaim-then-upsert pattern actually closes the escalation vector end to end.
describe('system-user seed reclaim (real DB)', () => {
  it('reclaims a squatted reserved username and denies the squatter a role grant', async () => {
    const reservedUsername = localSafeUsername('reserved')
    const squatter = await createLocalTestUserWithUsername(reservedUsername)
    const squatterId = squatter.id

    // Mirrors the shape every real generator appends after buildSystemUserUpsertSQL(): grant a
    // role by username lookup, gated on platform_account_kind = 'official'.
    const sql = `${buildSystemUserUpsertSQL(reservedUsername, 'official')}

INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u
JOIN user_role_types urt ON urt.slug = 'moderator'
WHERE u.username = '${reservedUsername}' AND u.platform_account_kind = 'official'
ON CONFLICT (user_id, role_type_id) DO NOTHING;`

    await runConfigDrivenStatementsInTransaction(sql, { beginTransaction })

    const squatterState = await getLocalTestUserRaw(squatterId)
    expect(squatterState?.username).toMatch(/^reclaimed-[0-9a-f]{32}$/)
    expect(squatterState?.platform_account_kind).toBeNull()

    const squatterRoleCount = await countAllLocalUserRoleAssignments(squatterId)
    expect(squatterRoleCount).toBe(0)

    const systemState = await getLocalTestUserRawByUsername(reservedUsername)
    expect(systemState?.platform_account_kind).toBe('official')
    expect(systemState?.id).not.toBe(squatterId)

    const systemRoleCount = await countLocalUserRoleAssignments(systemState!.id, 'moderator')
    expect(systemRoleCount).toBe(1)
  })

  it('rejects a missing eleventh seed email while preserving an existing email at the cap', async () => {
    const username = localSafeUsername('seed-email-cap')
    const email = `tests+${username}@voucha.ai`
    const seed = buildSeedAdminUserSQL(username, email)
    await runConfigDrivenStatementsInTransaction(seed, { beginTransaction })
    const user = await getLocalTestUserRawByUsername(username)
    await addLocalSecondaryEmailsForUser(
      user!.id,
      Array.from({ length: 9 }, (_, index) => `tests+${username}-${index}@voucha.ai`),
    )
    await runConfigDrivenStatementsInTransaction(seed, { beginTransaction })
    const rejectedEmail = `tests+${username}-excess@voucha.ai`
    await expect(
      runConfigDrivenStatementsInTransaction(buildSeedAdminUserSQL(username, rejectedEmail), {
        beginTransaction,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    expect(await countLocalEmailsForUser(user!.id)).toBe(10)
    expect(await isLocalPrimaryEmailForUser(user!.id, email)).toBe(true)
    expect(await isLocalPrimaryEmailForUser(user!.id, rejectedEmail)).toBe(false)
  })

  it('runs the real jong admin generator to a stable end state across reruns', async () => {
    await runConfigDrivenStatementsInTransaction(generateSeedAdminUserSQL(), { beginTransaction })
    await runConfigDrivenStatementsInTransaction(generateSeedAdminUserSQL(), { beginTransaction })

    const jong = await getLocalTestUserRawByUsername('jong')
    expect(jong?.platform_account_kind).toBe('official')

    const roleCount = await countLocalUserRoleAssignments(jong!.id, 'administrator')
    expect(roleCount).toBe(1)

    const hasPrimaryEmail = await isLocalPrimaryEmailForUser(jong!.id, 'jong@voucha.ai')
    expect(hasPrimaryEmail).toBe(true)
  })

  it('does not register a proposed orphan identity when an existing system user is seeded again', async () => {
    const reservedUsername = localSafeUsername('seed-replay')
    const sql = buildSystemUserUpsertSQL(reservedUsername)
    await runConfigDrivenStatementsInTransaction(sql, { beginTransaction })
    const existing = await getLocalTestUserRawByUsername(reservedUsername)
    expect(existing?.platform_account_kind).toBe('system')

    await runConfigDrivenStatementsInTransaction(sql, { beginTransaction })
    const replayed = await getLocalTestUserRawByUsername(reservedUsername)
    expect(replayed?.id).toBe(existing?.id)
    expect(await countLocalRetainedRootsFromCurrentUserVersion(replayed!.id)).toBe(0)
  })
})
