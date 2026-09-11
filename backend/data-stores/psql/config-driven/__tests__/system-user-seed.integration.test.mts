import { describe, expect, it } from 'vitest'
import {
  createLocalTestUserWithUsername,
  getLocalTestUserRaw,
  getLocalTestUserRawByUsername,
  countLocalUserRoleAssignments,
  countAllLocalUserRoleAssignments,
  localSafeUsername,
} from '../../test-helpers/users.mts'
import { isLocalPrimaryEmailForUser } from '../../test-helpers/email-addresses.mts'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import { buildSystemUserUpsertSQL } from '../utils/system-user-seed.mts'
import generateSeedAdminUserSQL from '../0010-00-02-seed-admin-user.mts'
import generateSeedAgentsSQL from '../0010-00-01-seed-agents.mts'

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
    // role by username lookup, gated on is_system = TRUE.
    const sql = `${buildSystemUserUpsertSQL(reservedUsername)}

INSERT INTO user_roles (user_id, role_type_id)
SELECT u.id, urt.id FROM users u
JOIN user_roles_types urt ON urt.slug = 'customer_support'
WHERE u.username = '${reservedUsername}' AND u.is_system = TRUE
ON CONFLICT (user_id, role_type_id) DO NOTHING;`

    await runConfigDrivenStatementsInTransaction(sql, undefined)

    const squatterState = await getLocalTestUserRaw(squatterId)
    expect(squatterState?.username).toMatch(/^reclaimed-[0-9a-f]{32}$/)
    expect(squatterState?.is_system).toBe(false)

    const squatterRoleCount = await countAllLocalUserRoleAssignments(squatterId)
    expect(squatterRoleCount).toBe(0)

    const systemState = await getLocalTestUserRawByUsername(reservedUsername)
    expect(systemState?.is_system).toBe(true)
    expect(systemState?.id).not.toBe(squatterId)

    const systemRoleCount = await countLocalUserRoleAssignments(systemState!.id, 'customer_support')
    expect(systemRoleCount).toBe(1)
  })

  it('runs the real jong admin generator to a stable end state across reruns', async () => {
    await runConfigDrivenStatementsInTransaction(generateSeedAdminUserSQL(), undefined)
    await runConfigDrivenStatementsInTransaction(generateSeedAdminUserSQL(), undefined)

    const jong = await getLocalTestUserRawByUsername('jong')
    expect(jong?.is_system).toBe(true)

    const roleCount = await countLocalUserRoleAssignments(jong!.id, 'administrator')
    expect(roleCount).toBe(1)

    const hasPrimaryEmail = await isLocalPrimaryEmailForUser(jong!.id, 'jong@voucha.ai')
    expect(hasPrimaryEmail).toBe(true)
  })

  // Idempotency of buildSystemUserUpsertSQL is already proven by the lightweight jong generator
  // test above. This runs the full agents generator only once: it emits ALTER TABLE ... ADD
  // COLUMN IF NOT EXISTS (ACCESS EXCLUSIVE lock) plus moderator/agent/prompt mutations against
  // rows shared with sibling test files (e.g. backend/agents/autotagger/run.test.mts); running it
  // twice here would add lock contention against the full parallel suite for no additional signal.
  it('runs the real customer-support agent generator to the reclaim-gated end state', async () => {
    await runConfigDrivenStatementsInTransaction(generateSeedAgentsSQL(), undefined)

    const customerSupport = await getLocalTestUserRawByUsername('customer-support')
    expect(customerSupport?.is_system).toBe(true)

    const supportRoleCount = await countLocalUserRoleAssignments(
      customerSupport!.id,
      'customer_support',
    )
    expect(supportRoleCount).toBe(1)

    const adminRoleCount = await countLocalUserRoleAssignments(customerSupport!.id, 'administrator')
    expect(adminRoleCount).toBe(0)
  })
})
