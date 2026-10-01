import { beginTransaction, query as primaryQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONFLICT } from '@modules/on-error/error-codes'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { lockActiveDataRequestUser } from '@services/account-data-requests/active-user-lock'
import { recordModeratorAction } from '@services/moderator-actions'
import { isAdminUser } from './authorization.mts'
import type { PrivateUser } from './types.mts'

const REFERENCE_MAX_LENGTH = 500
const HISTORY_LIMIT = 100

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
export type UserPreservationHold = {
  id: string
  account_user_id: string
  reference: string
  placed_by_id: string
  placed_at: Date
  released_by_id: string | null
  released_at: Date | null
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

/** The reference is a short matter identifier; the message never echoes the submitted text. */
export function parsePreservationHoldReference(reference: unknown): string {
  const trimmed = typeof reference === 'string' ? reference.trim() : ''
  if (!trimmed || trimmed.length > REFERENCE_MAX_LENGTH) {
    throw createHttpError(
      422,
      `Reference is required and must be at most ${REFERENCE_MAX_LENGTH} characters`,
    )
  }
  return trimmed
}

/**
 * Places the account's single open hold. While it is open, `deleteUser` refuses the account
 * (`assertCopyrightEvidenceAllowsDeletion`). The placement takes the same per-user advisory lock as
 * `deleteUser` and refuses a deleted account, so a hold can never be added behind an erasure that
 * has already committed. The reference is encrypted and is not copied to the moderator audit row.
 */
export async function placeUserPreservationHold(
  currentUser: PrivateUser | null,
  userId: string,
  reference: unknown,
): Promise<UserPreservationHold> {
  assertAdmin(currentUser)
  const plaintext = parsePreservationHoldReference(reference)
  const holdId = uuidv7()
  const ciphertext = encryptSecret(plaintext, referencePurpose(holdId))

  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- lock, insert, and audit must run in order on one transaction client.
  if (!(await lockActiveDataRequestUser(query, userId))) {
    throw createHttpError(404, 'User not found')
  }
  const { rows } = await query<HoldRow>(sql`/* placeUserPreservationHold */
    INSERT INTO user_legal_preservation_holds (id, account_user_id, placed_by_id, reference_ciphertext)
    VALUES (${holdId}, ${userId}, ${currentUser.id}, ${ciphertext})
    ON CONFLICT (account_user_id) WHERE released_at IS NULL DO NOTHING
    RETURNING id, account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id, created_at
  `)
  const row = rows[0]
  if (!row) throw createCodedError(409, 'User already has an open preservation hold', CONFLICT)
  await recordModeratorAction(
    currentUser.id,
    { actionType: 'preservation_hold_place', targetUserId: userId },
    { query },
  )
  await query.commit()
  return toHold(row)
}

/** Releases the open hold by stamping the release columns; the row and its history are kept. */
export async function releaseUserPreservationHold(
  currentUser: PrivateUser | null,
  userId: string,
): Promise<UserPreservationHold> {
  assertAdmin(currentUser)

  await using query = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- lock, release, and audit must run in order on one transaction client.
  if (!(await lockActiveDataRequestUser(query, userId))) {
    throw createHttpError(404, 'User not found')
  }
  const { rows } = await query<HoldRow>(sql`/* releaseUserPreservationHold */
    UPDATE user_legal_preservation_holds
    SET released_at = CURRENT_TIMESTAMP, released_by_id = ${currentUser.id}
    WHERE account_user_id = ${userId} AND released_at IS NULL
    RETURNING id, account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id, created_at
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

/** Newest first, capped at {@link HISTORY_LIMIT}: one hold is open at a time, so history stays small. */
export async function listUserPreservationHolds(
  currentUser: PrivateUser | null,
  userId: string,
): Promise<UserPreservationHold[]> {
  assertAdmin(currentUser)
  const { rows } = await primaryQuery<HoldRow>(sql`/* listUserPreservationHolds */
    SELECT id, account_user_id, placed_by_id, reference_ciphertext, released_at, released_by_id, created_at
    FROM user_legal_preservation_holds
    WHERE account_user_id = ${userId}
    ORDER BY id DESC
    LIMIT ${HISTORY_LIMIT}
  `)
  return rows.map(toHold)
}
