import { getPrivateUserByAny } from './get.mts'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  connectOAuthAccountToUser,
  runOAuthAccountConnectionPostCommitEffects,
} from '@services/oauth-accounts'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { USER_CREATION_RACE } from '@modules/on-error/error-codes'
import type { PrivateUser, CreateUserOptions, GetUserOptions } from './types.mts'

// Effective dates of the current consent documents.
// Update the relevant constant whenever a document is revised and re-consent is required.
export const PRIVACY_POLICY_VERSION = '2026-04-27'
export const TERMS_OF_SERVICE_VERSION = '2026-04-27'

export const createUser = async ({
  oauthAccount,
  emailAddress,
  phoneNumber,
  referrerId,
}: CreateUserOptions & { referrerId?: string | null }): Promise<PrivateUser> => {
  if (oauthAccount) {
    await using query = await beginTransaction()
    // ast-grep-ignore: no-three-sequential-awaits -- user creation must stay ordered in one transaction
    const id = await createUserId({ query }, referrerId)
    await connectOAuthAccountToUser(
      oauthAccount.provider,
      id,
      oauthAccount.account.provider_user_id,
      { query },
    )
    await grantSignupConsents(id, query)
    const user = await getPrivateUserByAny(id, { query })
    assert(user, 500, 'User not found after creation')
    await query.commit()
    await runOAuthAccountConnectionPostCommitEffects(user.id)
    return user
  }

  if (emailAddress) {
    await using query = await beginTransaction()
    const existing = await getPrivateUserByAny(emailAddress, { query })
    if (existing) throw createCodedError(409, 'User creation race', USER_CREATION_RACE)

    const id = await createUserId({ query }, referrerId)
    const {
      rows: [userEmailAddress],
    } = await query(sql`/* createUser */
        INSERT INTO user_email_addresses (user_id, email_address)
        VALUES (${id}, ${emailAddress})
        ON CONFLICT DO NOTHING
        RETURNING *
    `)
    if (!userEmailAddress) throw createCodedError(409, 'User creation race', USER_CREATION_RACE)
    await grantSignupConsents(id, query)
    const result = await getPrivateUserByAny(id, { query })
    assert(result, 500, 'User not found after creation')
    await query.commit()
    return result
  }

  if (phoneNumber) {
    await using query = await beginTransaction()
    const existing = await getPrivateUserByAny(phoneNumber, { query })
    if (existing) throw createCodedError(409, 'User creation race', USER_CREATION_RACE)

    const id = await createUserId({ query }, referrerId)
    const {
      rows: [userPhoneNumber],
    } = await query(sql`/* createUser */
        INSERT INTO user_phone_numbers (user_id, phone_number)
        VALUES (${id}, ${phoneNumber})
        ON CONFLICT DO NOTHING
        RETURNING *
    `)
    if (!userPhoneNumber) throw createCodedError(409, 'User creation race', USER_CREATION_RACE)
    await grantSignupConsents(id, query)
    const result = await getPrivateUserByAny(id, { query })
    assert(result, 500, 'User not found after creation')
    await query.commit()
    return result
  }

  throw createHttpError(
    400,
    'Cannot create user: no oauthAccount, emailAddress, or phoneNumber provided',
  )
}

export const getUser = async ({
  oauthAccount,
  emailAddress,
  phoneNumber,
  client,
}: GetUserOptions): Promise<PrivateUser | null> => {
  if (oauthAccount?.account.user_id) {
    const user = await getPrivateUserByAny(oauthAccount.account.user_id, { client })
    if (user) return user
  }

  if (emailAddress) return getPrivateUserByAny(emailAddress, { client })
  if (phoneNumber) return getPrivateUserByAny(phoneNumber, { client })
  return null
}

async function createUserId(options: QueryOptions, referrerId?: string | null) {
  const { rows } = await write(
    sql`/* createUserId */
    INSERT INTO users (referrer_id)
    VALUES (${referrerId ?? null})
    RETURNING *
  `,
    options,
  )
  return rows[0].id
}

async function grantSignupConsents(userId: string, query: QueryExecutor): Promise<void> {
  await query(sql`/* grantSignupConsents */
    WITH revoked AS (
      UPDATE user_consents
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = ${userId}
        AND consent_type IN (${'privacy_policy'}, ${'terms_of_service'})
        AND revoked_at IS NULL
    )
    INSERT INTO user_consents (user_id, consent_type, version)
    VALUES
      (${userId}, ${'privacy_policy'}, ${PRIVACY_POLICY_VERSION}),
      (${userId}, ${'terms_of_service'}, ${TERMS_OF_SERVICE_VERSION})
  `)
}
