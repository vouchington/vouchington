import { createRandomEmailAddress, createRandomPhoneNumber, safeUsername } from '../data.mts'
import { verifyPhoneNumber } from '@modules/utils'
import { v7 } from 'uuid'
import assert from 'node:assert'
import type { PrivateUser } from '@voucha/types/entities/user'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CreateTestUserOptions = {
  phone_number?: string | boolean
  administrator?: boolean
  extraRoles?: string[]
  username?: string
  noUsername?: boolean
  /**
   * Also insert a primary user_email_addresses row, mirroring the real upsertUser path.
   * Defaults to false: createTestUserDirect's contract is a row-only user with no email,
   * which contribution-gating tests rely on (an email row counts as verified).
   */
  withEmail?: boolean
}

type CreateTestUserWithAgeOptions = CreateTestUserOptions & {
  noEmail?: boolean
}

// Raw-primitive user creation backing users.mts's createTestUser — see that call site for why
// this package cannot depend on the real @services/users/create's upsertUser.
export async function createTestUserDirect(
  options: CreateTestUserOptions = {},
): Promise<PrivateUser> {
  const username = options.username ?? (options.noUsername ? null : createTestUsername())

  const { rows } = await write(sql`/* createTestUserDirect */
    INSERT INTO users (username)
    VALUES (${username})
    RETURNING id
  `)

  const userId = rows[0].id as string

  if (options.withEmail) {
    const emailAddress = createRandomEmailAddress()
    await write(sql`/* createTestUserDirect */
      INSERT INTO user_email_addresses (user_id, email_address, is_primary)
      VALUES (${userId}, ${emailAddress}, TRUE)
    `)
  }

  if (options.administrator) {
    await addTestUserRole(userId, 'administrator')
  }
  for (const roleSlug of options.extraRoles ?? []) {
    await addTestUserRole(userId, roleSlug)
  }

  const phoneNumber = getTestPhoneNumber(options.phone_number)
  if (phoneNumber) {
    await attachTestPhoneNumber(userId, phoneNumber)
  }

  const privateUser = await getTestPrivateUserById(userId)
  assert(privateUser, 'createTestUserDirect could not read the inserted user')
  return privateUser
}

export async function createUnonboardedTestUserDirect(
  options: CreateTestUserOptions = {},
): Promise<PrivateUser> {
  const username = options.noUsername ? null : (options.username ?? createTestUsername())
  const { rows } = await write(sql`/* createUnonboardedTestUserDirect */
    INSERT INTO users (username)
    VALUES (${username})
    RETURNING id
  `)
  const userId = rows[0].id as string
  if (options.administrator) {
    await addTestUserRole(userId, 'administrator')
  }
  for (const roleSlug of options.extraRoles ?? []) {
    await addTestUserRole(userId, roleSlug)
  }
  const phoneNumber = getTestPhoneNumber(options.phone_number)
  if (phoneNumber) {
    await attachTestPhoneNumber(userId, phoneNumber)
  }
  const privateUser = await getTestPrivateUserById(userId)
  assert(privateUser, 'createUnonboardedTestUserDirect could not read the inserted user')
  return privateUser
}

// Exported (not just used locally) so @services/users/test-support's real, upsertUser-based
// createTestUser can reuse this instead of duplicating the same raw-primitive logic.
export function getTestPhoneNumber(phoneNumberOption?: string | boolean): string | null {
  if (typeof phoneNumberOption === 'string') return phoneNumberOption
  if (phoneNumberOption) return createRandomPhoneNumber()
  return null
}

export function createTestUsername() {
  return safeUsername('test-user')
}

// Insert with explicit ID for non-UUIDv7 code path tests (e.g. uuid_extract_timestamp).
export async function createTestUserWithId(id: string, username: string): Promise<void> {
  await write(sql`/* createTestUserWithId */
    INSERT INTO users (id, username) VALUES (${id}, ${username})
  `)
}

export async function createTestUserWithAge(
  ageMs: number,
  options: CreateTestUserWithAgeOptions = {},
): Promise<PrivateUser> {
  assert(ageMs >= 0, 'ageMs must be >= 0')
  const id = v7({ msecs: Date.now() - ageMs })
  const username = options.noUsername
    ? null
    : options.username !== undefined
      ? options.username
      : createTestUsername()

  await write(sql`/* createTestUserWithAge */
    INSERT INTO users (id, username)
    VALUES (${id}, ${username})
  `)

  if (!options.noEmail) {
    const emailAddress = createRandomEmailAddress()
    await write(sql`/* createTestUserWithAge */
      INSERT INTO user_email_addresses (user_id, email_address, is_primary)
      VALUES (${id}, ${emailAddress}, TRUE)
    `)
  }

  if (options.administrator) {
    await addTestUserRole(id, 'administrator')
  }

  const phoneNumber = getTestPhoneNumber(options.phone_number)
  if (phoneNumber) {
    await attachTestPhoneNumber(id, phoneNumber)
  }

  const privateUser = await getTestPrivateUserById(id)
  assert(privateUser, 'createTestUserWithAge could not read the inserted user')
  return privateUser
}

// The real addUserRole (@services/users/roles-permissions) also fires enqueueRecalculateUserVoteWeight
// and markJwtStale. This package must never depend on a service that already devDeps this package
// for its own tests, so RBAC test setup here is a raw-primitive duplicate that intentionally omits
// those async side effects — tests that assert on vote-weight recalculation or JWT staleness import
// the real addUserRole directly from @services/users/roles-permissions.
export async function addTestUserRole(userId: string, roleSlug: string): Promise<void> {
  await write(sql`/* addTestUserRole */
    WITH user_role AS (
      SELECT id FROM user_roles_types WHERE slug = ${roleSlug}
    )
    INSERT INTO user_roles (user_id, role_type_id)
    SELECT ${userId}, id
    FROM user_role
    ON CONFLICT (user_id, role_type_id) DO NOTHING
  `)
}

// Raw-primitive substitute for @services/users/get's getPrivateUserByAny, restricted to the
// ID-only lookup this file always performs (a fresh user's own id, never an email/username/phone
// identifier) — a pure read with no side effects, so the simplification is safe. view_users_private
// already filters deleted_at IS NULL.
export async function getTestPrivateUserById(userId: string): Promise<PrivateUser | null> {
  const { rows } = await read(sql`/* getTestPrivateUserById */
    SELECT * FROM view_users_private WHERE id = ${userId} LIMIT 1
  `)
  return (rows[0] as PrivateUser | undefined) ?? null
}

// The real updateUserPhoneNumber (@services/users/update-contact-info) also verifies a login
// token and fires enqueueOnUserUpdated. Test fixtures already have a fresh, valid phone number
// with no token to verify, so this raw-primitive duplicate mirrors only the is_primary swap —
// see addTestUserRole above for why this package cannot import the real service function.
export async function attachTestPhoneNumber(userId: string, phoneNumber: string): Promise<void> {
  // Store the E.164-normalized number like the real updateUserPhoneNumber does — phone
  // lookups normalize their input, so a raw fixture format would never match.
  const normalizedPhoneNumber = verifyPhoneNumber(phoneNumber)
  await write(sql`/* attachTestPhoneNumber */
    UPDATE user_phone_numbers
    SET is_primary = FALSE
    WHERE user_id = ${userId}
      AND is_primary = TRUE
  `)
  await write(sql`/* attachTestPhoneNumber */
    INSERT INTO user_phone_numbers (user_id, phone_number, is_primary)
    VALUES (${userId}, ${normalizedPhoneNumber}, TRUE)
    ON CONFLICT (user_id, phone_number)
    DO UPDATE SET is_primary = TRUE
  `)
}
