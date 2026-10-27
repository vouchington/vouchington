import {
  read,
  runWithTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import onError from '@modules/on-error'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { assertUserHasSignInMethod } from '@services/oauth-accounts/sign-in-methods'

export type EmailAddress = {
  email_address: string
  is_primary: boolean
  created_at: Date
}

async function makeEmailAddressPrimary(
  query: TransactionQuery,
  userId: string,
  normalizedEmail: string,
): Promise<void> {
  await query(
    sql`/* setPrimaryEmailAddress */ UPDATE user_email_addresses SET is_primary = FALSE WHERE user_id = ${userId} AND is_primary = TRUE`,
  )
  await query(
    sql`/* setPrimaryEmailAddress */ UPDATE user_email_addresses SET is_primary = TRUE WHERE user_id = ${userId} AND email_address = ${normalizedEmail}`,
  )
}

export async function listEmailAddressesPage(
  userId: string,
  options: { limit: number; after?: { tier: number; id: string } },
) {
  const query = sql`/* listEmailAddressesPage */
    SELECT id, email_address, COALESCE(is_primary, FALSE) AS is_primary, created_at
    FROM user_email_addresses
    WHERE user_id = ${userId}
  `
  if (options.after) {
    query.append(sql` AND (
      (is_primary::int) < ${options.after.tier}
      OR ((is_primary::int) = ${options.after.tier} AND id > ${options.after.id}::uuid)
    )`)
  }
  query.append(sql` ORDER BY (is_primary::int) DESC, id ASC LIMIT ${options.limit + 1}`)
  const { rows } = await read<EmailAddress & { id: string }>(query)
  return {
    results: rows.slice(0, options.limit),
    hasNextPage: rows.length > options.limit,
  }
}

export async function getPrimaryEmailAddress(userId: string): Promise<string | null> {
  const { rows } = await read<{ email_address: string }>(
    sql`/* getPrimaryEmailAddress */ SELECT email_address FROM user_email_addresses WHERE user_id = ${userId} ORDER BY (is_primary::int) DESC, id ASC LIMIT 1`,
  )
  return rows[0]?.email_address ?? null
}

export async function setPrimaryEmailAddress(
  userId: string,
  emailAddress: string,
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  const normalized = emailAddress.toLowerCase().trim()
  await runWithTransaction(options.query, async query => {
    await query(
      sql`/* setPrimaryEmailAddress */ SELECT fn_lock_active_user_for_mutation(${userId})`,
    )
    const exists = await query(
      sql`/* setPrimaryEmailAddress */ SELECT 1 FROM user_email_addresses WHERE user_id = ${userId} AND email_address = ${normalized} LIMIT 1`,
    )
    assert(exists.rows.length > 0, 404, 'Email address not found')
    await makeEmailAddressPrimary(query, userId, normalized)
    registerEmailAddressPostCommitEffects(userId, query)
  })
}

export async function removeEmailAddress(
  userId: string,
  emailAddress: string,
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  const normalized = emailAddress.toLowerCase().trim()

  await runWithTransaction(options.query, async query => {
    await query(sql`/* removeEmailAddress */ SELECT fn_lock_active_user_for_mutation(${userId})`)

    const { rows } = await query<{
      email_address: string
      is_primary: boolean
      has_other_email: boolean
    }>(
      sql`/* removeEmailAddress */
      SELECT email_address, is_primary, EXISTS (
        SELECT 1 FROM user_email_addresses other
        WHERE other.user_id = ${userId} AND other.email_address <> ${normalized}
      ) AS has_other_email
      FROM user_email_addresses
      WHERE user_id = ${userId} AND email_address = ${normalized}
      FOR UPDATE`,
    )
    const target = rows[0]
    assert(target, 404, 'Email address not found')

    assert(
      !target.is_primary || !target.has_other_email,
      400,
      'Cannot remove your primary email address. Set another as primary first.',
    )

    await query(
      sql`/* removeEmailAddress */ DELETE FROM user_email_addresses WHERE user_id = ${userId} AND email_address = ${normalized}`,
    )
    await assertUserHasSignInMethod(userId, query)
    registerEmailAddressPostCommitEffects(userId, query)
  })
}

function registerEmailAddressPostCommitEffects(userId: string, query: TransactionQuery): void {
  registerPostCommitAction(query, async () => {
    await invalidateVerifiedEmailCache(userId).catch(onError)
    void enqueueOnUserUpdated(userId)
  })
}
