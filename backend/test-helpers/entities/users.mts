import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'node:assert'
import type { BasicUser, PrivateUser } from '@voucha/types/entities/user'
import { isSlug } from '@modules/utils'
import {
  createTestUserDirect,
  createUnonboardedTestUserDirect,
  getTestPhoneNumber,
  createTestUsername,
  createTestUserWithId,
  createTestUserWithAge,
  addTestUserRole,
  getTestPrivateUserById,
  attachTestPhoneNumber,
  type CreateTestUserOptions,
} from './users-direct.mts'

export {
  clearMfaForUser,
  getTestUserRaw,
  hardDeleteTestUser,
  hardDeleteTestUserWithLockTimeout,
  hardDeleteTestUserAndWaitBeforeCommit,
  restoreUser,
  setTestUserVoteWeightRecalculatedAt,
  setTestUserVoteWeight,
  setUserMarkdown,
  softDeleteUser,
  softDeleteUserAt,
  softDeleteUserDaysAgo,
  softDeleteTestUserAndWaitBeforeCommit,
  suspendTestUser,
  suspendTestUserGetId,
  getTestUserSuspension,
  lockTestUserSuspension,
  unsuspendTestUser,
} from './users-lifecycle.mts'

export { lockTestUserMutation } from './users-mutation-locks.mts'

// Split out of this file (concern: raw/direct user-row primitives) into users-direct.mts; kept
// re-exported here so `@voucha/test-helpers` and `@voucha/test-helpers/entities/users` consumers
// resolve unchanged.
export {
  createTestUserDirect,
  createUnonboardedTestUserDirect,
  getTestPhoneNumber,
  createTestUsername,
  createTestUserWithId,
  createTestUserWithAge,
  addTestUserRole,
  getTestPrivateUserById,
  attachTestPhoneNumber,
}

// Raw-SQL fixture: row-only substitute for the real @services/users/create's upsertUser (no
// OAuth/attribution/consent side effects, no entity-listener enqueues), so test-helpers does not
// depend on that service package (every backend service devDeps test-helpers for its tests, so a
// test-helpers -> @services/users edge is a workspace cycle). Fixtures that assert on those genuine
// side effects must use the real createTestUser from `@services/users/test-support` instead.
// withEmail mirrors upsertUser's always-created primary email; createTestUserDirect stays
// email-free for tests that need an unverified-email user.
export async function createTestUser(options: CreateTestUserOptions = {}): Promise<PrivateUser> {
  return createTestUserDirect({ withEmail: true, ...options })
}

export async function updateUserUsername(userId: string, username: string): Promise<void> {
  await write(sql`
    UPDATE users
    SET username = ${username}
    WHERE id = ${userId}
  `)
}

export async function clearTestUserModerationEmailTimezone(userId: string): Promise<void> {
  await write(sql`
    UPDATE users
    SET moderation_email_timezone = NULL
    WHERE id = ${userId}
  `)
}

export async function updateTestUserUiLocale(
  userId: string,
  uiLocale: string | null,
): Promise<void> {
  await write(sql`
    UPDATE users
    SET ui_locale = ${uiLocale}
    WHERE id = ${userId}
  `)
}

export async function countUserRoleAssignments(userId: string, roleSlug: string): Promise<number> {
  const { rows } = await write(sql`
    SELECT COUNT(*)::int AS count
    FROM user_roles ur
    INNER JOIN user_roles_types urt ON ur.role_type_id = urt.id
    WHERE ur.user_id = ${userId}
      AND urt.slug = ${roleSlug}
  `)

  return rows[0]?.count ?? 0
}

// is_system = TRUE so callers that look this fixture up via getSystemUserByUsername /
// getModerationSystemUserId / getRssFeedAutoUpdaterUserId (all is_system-gated to close the
// reserved-username squatting vector) resolve it. ON CONFLICT DO UPDATE self-heals a row that
// db:migrate's real seed generators already created for a reserved username such as
// MODERATION_SYSTEM_USERNAME, and always returns a row via RETURNING, so no SELECT fallback needed.
export async function createSystemUser(username: string): Promise<BasicUser> {
  assert(isSlug(username), `Username "${username}" must be a valid slug`)
  type Row = { id: string; username: string; use_display_name_from: string | null }
  const { rows } = await write<Row>(sql`/* createSystemUser */
    INSERT INTO users (username, is_system) VALUES (${username}, TRUE)
    ON CONFLICT ((LOWER(username))) WHERE username IS NOT NULL
    DO UPDATE SET is_system = TRUE
    WHERE users.is_system = TRUE
    RETURNING id, username, use_display_name_from
  `)
  return { ...rows[0]!, __entity_type: 'user', roles: [] } as BasicUser
}
