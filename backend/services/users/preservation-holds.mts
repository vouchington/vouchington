import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { createCodedError } from '@vouchington/sentry'
import { CONFLICT } from '@modules/on-error/error-codes'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { recordModeratorAction } from '@services/moderator-actions'
import { isAdminUser } from './authorization.mts'
import { parsePreservationHoldReference } from './preservation-hold-reference.mts'
import type { PrivateUser } from './types.mts'
import { getUsersWorkLimit } from './work-limits.mts'

type HoldRow = {
  id: string
  account_user_id: string
  placed_by_id: string
  reference_ciphertext: string
  released_at: Date | null
  released_by_id: string | null
  created_at: Date
}

/** A legal-process preservation hold. `reference` is sensitive: administrators only, never logged. */
type UserPreservationHold = {
  id: string
  account_user_id: string
  reference: string
  placed_by_id: string
  placed_at: Date
  released_by_id: string | null
  released_at: Date | null
}

export type UserPreservationHoldState = {
  accountDeletedAt: Date | null
  holds: UserPreservationHold[]
}

/** The reference is bound to its hold id, so a ciphertext cannot be replayed onto another hold. */
function referencePurpose(holdId: string): string {
  return `user-legal-preservation-hold:${holdId}`
}

function toHold(row: HoldRow): UserPreservationHold {
  return {
    id: row.id,
    account_user_id: row.account_user_id,
    reference: decryptSecret(row.reference_ciphertext, referencePurpose(row.id)),
    placed_by_id: row.placed_by_id,
    placed_at: row.created_at,
    released_by_id: row.released_by_id,
    released_at: row.released_at,
  }
}

function assertAdmin(currentUser: PrivateUser | null): asserts currentUser is PrivateUser {
  if (!isAdminUser(currentUser)) throw createHttpError(403, 'Forbidden')
}

/**
 * Locks the account row `FOR NO KEY UPDATE`, the lock final purge takes before its DELETE: the purge
 * either deletes first (this reports 404) or sees the committed hold and deletes nothing.
 */
async function readPreservationHoldUser(
  query: QueryExecutor,
  userId: string,
): Promise<{ deleted_at: Date | null } | undefined> {
  const { rows } = await query<{
    deleted_at: Date | null
  }>(sql`/* lockPreservationHoldUser:userExists */
    SELECT deleted_at FROM users WHERE id = ${userId} FOR NO KEY UPDATE
  `)
  return rows[0]
}

/**
 * Places the account's single open hold at READ COMMITTED. The `FOR NO KEY UPDATE` account lock
 * orders it against final purge (a purge already holding the row makes this report 404; a purge
 * reaching the row after this commits deletes nothing and refuses on its next run) and against other hold writers, and the one-open unique index backs
 * the single open hold. A soft-deleted account remains eligible for preservation.
 * The reference is encrypted and is not copied to the moderator audit row.
 */
export async function placeUserPreservationHold(
  currentUser: PrivateUser | null,
  userId: string,
  reference: unknown,
): Promise<UserPreservationHold & { accountDeletedAt: Date | null }> {
  assertAdmin(currentUser)
  const plaintext = parsePreservationHoldReference(reference)
  const holdId = uuidv7()
  const ciphertext = encryptSecret(plaintext, referencePurpose(holdId))

  await using query = await beginTransaction()
  const account = await readPreservationHoldUser(query, userId)
  if (!account) {
    throw createHttpError(404, 'User not found')
  }
  const { rows } = await query<HoldRow>(sql`/* placeUserPreservationHold */
    WITH placed AS (
      INSERT INTO user_legal_preservation_holds (id, account_user_id, placed_by_id, reference_ciphertext)
      VALUES (${holdId}, ${userId}, ${currentUser.id}, ${ciphertext})
      ON CONFLICT (account_user_id) WHERE released_at IS NULL DO NOTHING
      RETURNING id, account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id, created_at
    ), marked AS (
      UPDATE retained_user_identities identity
      SET is_copyright_case_clock_sync_pending = identity.is_copyright_case_clock_sync_pending OR EXISTS (SELECT 1 FROM copyright_notice_party_identities party
          WHERE party.account_user_id = identity.id LIMIT 1)
      FROM placed WHERE identity.id = placed.account_user_id
      RETURNING identity.id
    )
    SELECT placed.* FROM placed JOIN marked ON marked.id = placed.account_user_id
  `)
  const row = rows[0]
  if (!row) throw createCodedError(409, 'User already has an open preservation hold', CONFLICT)
  await recordModeratorAction(
    currentUser.id,
    { actionType: 'preservation_hold_place', targetUserId: userId },
    { query },
  )
  await query.commit()
  return { ...toHold(row), accountDeletedAt: account.deleted_at }
}

/** Releases the open hold by stamping the release columns; the row and its history are kept. */
export async function releaseUserPreservationHold(
  currentUser: PrivateUser | null,
  userId: string,
): Promise<UserPreservationHold> {
  assertAdmin(currentUser)

  await using query = await beginTransaction()
  if (!(await readPreservationHoldUser(query, userId))) {
    throw createHttpError(404, 'User not found')
  }
  const { rows } = await query<HoldRow>(sql`/* releaseUserPreservationHold */
    WITH released AS (
      UPDATE user_legal_preservation_holds
      SET released_at = clock_timestamp(), released_by_id = ${currentUser.id}
      WHERE account_user_id = ${userId} AND released_at IS NULL
      RETURNING id, account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id, created_at
    ), clocked AS (
      UPDATE retained_user_identities identity
      SET last_legal_preservation_hold_released_at = GREATEST(
        identity.last_legal_preservation_hold_released_at, released.released_at),
        is_copyright_case_clock_sync_pending = identity.is_copyright_case_clock_sync_pending OR EXISTS (SELECT 1 FROM copyright_notice_party_identities party
            WHERE party.account_user_id = identity.id LIMIT 1)
      FROM released WHERE identity.id = released.account_user_id
      RETURNING identity.id
    )
    SELECT released.* FROM released JOIN clocked ON clocked.id = released.account_user_id
  `)
  const row = rows[0]
  if (!row) throw createCodedError(409, 'User has no open preservation hold', CONFLICT)
  await recordModeratorAction(
    currentUser.id,
    { actionType: 'preservation_hold_release', targetUserId: userId },
    { query },
  )
  await query.commit()
  return toHold(row)
}

async function queryUserPreservationHolds(
  query: QueryExecutor,
  userId: string,
): Promise<UserPreservationHold[]> {
  const { rows } = await query<HoldRow>(sql`/* listUserPreservationHolds */
    SELECT id, account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id, created_at
    FROM user_legal_preservation_holds
    WHERE account_user_id = ${userId}
    ORDER BY id DESC
    LIMIT ${getUsersWorkLimit('preservation_hold_history_limit')}
  `)
  return rows.map(toHold)
}

/** Route-facing account state. History remains queryable internally after final user deletion. */
export async function getUserPreservationHoldState(
  currentUser: PrivateUser | null,
  userId: string,
): Promise<UserPreservationHoldState> {
  assertAdmin(currentUser)
  await using query = await beginTransaction()
  const account = await readPreservationHoldUser(query, userId)
  if (!account) throw createHttpError(404, 'User not found')
  const holds = await queryUserPreservationHolds(query, userId)
  await query.commit()
  return {
    accountDeletedAt: account.deleted_at,
    holds,
  }
}
