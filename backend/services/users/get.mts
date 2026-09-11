import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import assert from 'http-assert'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { isEmailAddress } from '@ts-shared/utils/validation-core'
import { isPhoneNumber, isUUID, isUsername, verifyPhoneNumber } from '@modules/utils'
import type { GetUserByAnyArgumentsOptions, PublicUser, PrivateUser } from './types.mts'

const getUserByAnyArguments = (
  string: string,
  options: GetUserByAnyArgumentsOptions = {},
): [string[] | null, string[] | null] => {
  if (!string) return [null, null]

  // OR
  const filters = []
  const values = []

  if (isUUID(string)) {
    filters.push(`id = $${values.push(string)}`)
  } else if (options.private && isEmailAddress(string)) {
    const normalizedEmail = string.toLowerCase()
    // NOTE: look up users by email from OAuth providers that return verified emails only.
    // Facebook and Apple always return verified emails.
    // Google and LinkedIn require email_verified=true (enforced in their services).
    // Microsoft uses mail (verified SMTP address), not userPrincipalName.
    // X stores null email (no email scope in OAuth flow).
    filters.push(`(
      EXISTS (
        SELECT 1
        FROM user_email_addresses
        WHERE user_email_addresses.email_address = $${values.push(normalizedEmail)}
          AND user_email_addresses.user_id = users.id
      ) OR EXISTS (
        SELECT 1
        FROM facebook_accounts
        WHERE facebook_user_email_address = $${values.push(normalizedEmail)}
          AND user_id = users.id
      ) OR EXISTS (
        SELECT 1
        FROM apple_accounts
        WHERE apple_user_email_address = $${values.push(normalizedEmail)}
          AND user_id = users.id
      ) OR EXISTS (
        SELECT 1
        FROM google_accounts
        WHERE google_user_email_address = $${values.push(normalizedEmail)}
          AND user_id = users.id
      ) OR EXISTS (
        SELECT 1
        FROM linkedin_accounts
        WHERE linkedin_user_email_address = $${values.push(normalizedEmail)}
          AND user_id = users.id
      ) OR EXISTS (
        SELECT 1
        FROM microsoft_accounts
        WHERE microsoft_user_email_address = $${values.push(normalizedEmail)}
          AND user_id = users.id
      )
    )`)
  } else if (isUsername(string)) {
    filters.push(`LOWER(username) = LOWER($${values.push(string)})`)
  } else if (options.private && isPhoneNumber(string)) {
    filters.push(`EXISTS (
      SELECT 1
      FROM user_phone_numbers
      WHERE user_phone_numbers.phone_number = $${values.push(verifyPhoneNumber(string))}
        AND user_phone_numbers.user_id = users.id
    )`)
  } else {
    throw createError(422, `Invalid user identifier: ${string}`)
  }

  if (filters.length === 0) return [null, null]
  return [['deleted_at IS NULL', `(${filters.join(' OR ')})`], values]
}

export const getPublicUserByAny = async (
  string: string,
  options: QueryOptions = {},
): Promise<PublicUser | null> => {
  const [filters, values] = getUserByAnyArguments(string, { private: false, ...options })
  if (!filters || !values) return null
  const query = `/* getPublicUserByAny */
    WITH user_data AS (
      SELECT *
      FROM users
      WHERE ${filters.join(' AND ')}
      LIMIT 1
    )

    SELECT view_users_public.* FROM view_users_public
    JOIN user_data ON user_data.id = view_users_public.id
    LIMIT 1
  `
  const { rows } = await runUserLookupQuery(query, values, options)
  return rows[0] || null
}

export const getPrivateUserByAny = async (
  string: string,
  options: QueryOptions = {},
): Promise<PrivateUser | null> => {
  const [filters, values] = getUserByAnyArguments(string, { private: true, ...options })
  if (!filters || !values) return null
  const query = `/* getPrivateUserByAny */
    WITH user_data AS (
      SELECT *
      FROM users
      WHERE ${filters.join(' AND ')}
      LIMIT 1
    )

    SELECT view_users_private.* FROM view_users_private
    JOIN user_data ON user_data.id = view_users_private.id
    LIMIT 1
  `
  const { rows } = await runUserLookupQuery(query, values, options)
  return rows[0] || null
}

function runUserLookupQuery(query: string, values: string[], options: QueryOptions) {
  const runQuery = options.readOnly === false ? write : read
  return runQuery(query, values, options)
}

// Route handlers must use these wrappers when the input comes from a :idOrSlug
// URL param. They reject email/phone identifiers to prevent enumeration attacks
// where response codes (403 vs 404) reveal whether a contact is registered.
// Authentication and contact-info services continue to call the underlying
// functions directly with pre-verified identifiers.

const assertIdOrSlug = (idOrSlug: string): void => {
  if (isUUID(idOrSlug) || isUsername(idOrSlug)) return
  assert(!isEmailAddress(idOrSlug) && !isPhoneNumber(idOrSlug), 422, 'Invalid user identifier')
}

export const getPrivateUserByIdOrSlug = (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<PrivateUser | null> => {
  assertIdOrSlug(idOrSlug)
  return getPrivateUserByAny(idOrSlug, options)
}

export const getPublicUserByIdOrSlug = (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<PublicUser | null> => {
  assertIdOrSlug(idOrSlug)
  return getPublicUserByAny(idOrSlug, options)
}

let systemUser
export const getSystemUser = async () => {
  systemUser ||= await getPrivateUserByAny('system@voucha.ai')
  return systemUser
}

export async function getUserMarkdown(userId: string): Promise<string | null> {
  const { rows } = await read(
    sql`/* getUserMarkdown */ SELECT markdown FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`,
  )
  return rows[0]?.markdown ?? null
}

export async function isFollowingUser(viewerId: string, targetId: string): Promise<boolean> {
  const { rows } = await read(
    sql`/* isFollowingUser */ SELECT 1 FROM relation__user__follow__user WHERE subject_id = ${viewerId} AND object_id = ${targetId} AND deleted_at IS NULL LIMIT 1`,
  )
  return rows.length > 0
}
