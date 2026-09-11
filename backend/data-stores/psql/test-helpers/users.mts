import { randomBytes } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// @data-stores/psql cannot depend on @voucha/test-helpers: test-helpers itself depends on
// @data-stores/psql, and every backend service devDeps test-helpers for its tests, so a
// psql -> test-helpers edge would close a workspace dependency cycle (disallowWorkspaceCycles).
// This is a trimmed-down, package-local substitute for test-helpers' createTestUserDirect, for
// psql's own tests that only need a valid users.id foreign key (no username/roles/phone number
// assertions). Do not export this outside @data-stores/psql — use test-helpers in every other
// package.
export async function createLocalTestUser(): Promise<{ id: string; username: string | null }> {
  const { rows } = await write<{ id: string; username: string | null }>(sql`
    INSERT INTO users DEFAULT VALUES
    RETURNING id, username
  `)
  return rows[0]!
}

// Package-local substitute for test-helpers' safeUsername (same workspace-cycle rationale as
// createLocalTestUser above). Mirrors its guarantees: starts with a letter, [a-z0-9-] only, ends
// alphanumeric, well under the 50-char validateUsername limit, never all-numeric/phone-shaped.
export function localSafeUsername(label = 'user'): string {
  const cleaned = `u-${label}`.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
  const randomSuffix = randomBytes(6).toString('hex')
  const prefix = cleaned.slice(0, 50 - randomSuffix.length - 1).replace(/-+$/, '')
  return `${prefix}-${randomSuffix}`
}

// Plants a user under a specific username (e.g. a reserved system username) so tests can assert
// on the reclaim-then-upsert path. Package-local counterpart to createLocalTestUser above.
export async function createLocalTestUserWithUsername(
  username: string,
): Promise<{ id: string; username: string | null }> {
  const { rows } = await write<{ id: string; username: string | null }>(sql`
    INSERT INTO users (username) VALUES (${username})
    RETURNING id, username
  `)
  return rows[0]!
}

export async function getLocalTestUserRaw(userId: string): Promise<{
  id: string
  username: string | null
  is_system: boolean
} | null> {
  const { rows } = await read<{ id: string; username: string | null; is_system: boolean }>(sql`
    SELECT id, username, is_system FROM users WHERE id = ${userId}
  `)
  return rows[0] ?? null
}

// Companion to getLocalTestUserRaw, keyed by username instead of id — for asserting on the system
// row a reclaim-then-upsert generator creates/updates, whose id is not known ahead of the query.
export async function getLocalTestUserRawByUsername(username: string): Promise<{
  id: string
  username: string | null
  is_system: boolean
} | null> {
  const { rows } = await read<{ id: string; username: string | null; is_system: boolean }>(sql`
    SELECT id, username, is_system FROM users WHERE username = ${username}
  `)
  return rows[0] ?? null
}

export async function countLocalUserRoleAssignments(
  userId: string,
  roleSlug: string,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM user_roles ur
    INNER JOIN user_roles_types urt ON ur.role_type_id = urt.id
    WHERE ur.user_id = ${userId}
      AND urt.slug = ${roleSlug}
  `)
  return rows[0]?.count ?? 0
}

// Unlike countLocalUserRoleAssignments, asserts a user holds no role of any kind — used to prove a
// reclaimed squatter never inherits the role grant meant for the system account it was renamed out
// of the way of.
export async function countAllLocalUserRoleAssignments(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM user_roles
    WHERE user_id = ${userId}
  `)
  return rows[0]?.count ?? 0
}
