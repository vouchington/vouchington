/**
 * Email address entity helpers
 */

import { read, write, beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { ValkeyCache } from '@data-stores/valkey/cache'
import sql from 'sql-template-strings'

/**
 * Insert a verified email address for a user into user_email_addresses.
 * This simulates a user who has completed email verification.
 */
export async function addVerifiedEmailForUser(userId: string, email: string): Promise<void> {
  await write(sql`
    INSERT INTO user_email_addresses (user_id, email_address, is_primary)
    VALUES (${userId}, ${email}, false)
    ON CONFLICT (user_id, email_address) DO NOTHING
  `)
}

/**
 * Give a user exclusive primary ownership of an email address, evicting any
 * other user currently holding it as primary. Used in seed-collision tests.
 */
export async function setPrimaryEmailForUser(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await write(
      sql`/* setPrimaryEmailForUser */
        UPDATE user_email_addresses SET is_primary = FALSE WHERE user_id = ${userId}
      `,
      { query },
    )
    await write(
      sql`/* setPrimaryEmailForUser */
        UPDATE user_email_addresses SET is_primary = FALSE WHERE email_address = ${normalizedEmail}
      `,
      { query },
    )
    await write(
      sql`/* setPrimaryEmailForUser */
        INSERT INTO user_email_addresses (user_id, email_address, is_primary)
        VALUES (${userId}, ${normalizedEmail}, TRUE)
        ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE
      `,
      { query },
    )
    await transaction.commit()
  }
}

/**
 * Insert a disposable email domain into the blacklist and add a corresponding
 * email address to user_email_addresses for a user. The domain blacklist source
 * is created with type='email' to mark it as a disposable email domain source.
 */
export async function addDisposableEmailForUser(
  userId: string,
  email: string,
  domain: string,
): Promise<void> {
  const { rows: sourceRows } = await write(sql`
    INSERT INTO domain_blacklist_sources (type, name, url)
    VALUES ('email'::domain_blacklist_types, 'test-disposable-email', 'https://example.com/list.txt')
    ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type, url = EXCLUDED.url
    RETURNING id
  `)
  const sourceId = sourceRows[0].id

  await write(sql`
    INSERT INTO domain_blacklists (source_id, domain)
    VALUES (${sourceId}, ${domain})
    ON CONFLICT (domain, source_id) DO NOTHING
  `)

  await write(sql`
    INSERT INTO user_email_addresses (user_id, email_address, is_primary)
    VALUES (${userId}, ${email}, false)
    ON CONFLICT (user_id, email_address) DO NOTHING
  `)
}

/**
 * Add a disposable email domain to the blacklist without adding a user_email_addresses row.
 */
export async function addDisposableDomain(domain: string): Promise<void> {
  const { rows: sourceRows } = await write(sql`
    INSERT INTO domain_blacklist_sources (type, name, url)
    VALUES ('email'::domain_blacklist_types, 'test-disposable-email', 'https://example.com/list.txt')
    ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type, url = EXCLUDED.url
    RETURNING id
  `)
  const sourceId = sourceRows[0].id

  await write(sql`
    INSERT INTO domain_blacklists (source_id, domain)
    VALUES (${sourceId}, ${domain})
    ON CONFLICT (domain, source_id) DO NOTHING
  `)
}

/**
 * Insert email address login token directly into database (for testing).
 * The raw token is normalized and hashed before storage, matching production verification.
 */
export async function insertEmailAddressLoginToken(
  emailAddress: string,
  token: string,
  loggedIn: boolean = false,
): Promise<void> {
  const hashed = hashToken('email-address-login-token', token.toUpperCase())
  if (loggedIn) {
    await write(sql`
      INSERT INTO email_address_login_tokens (email_address, token, logged_in_at)
      VALUES (${emailAddress}, ${hashed}, CURRENT_TIMESTAMP)
    `)
  } else {
    await write(sql`
      INSERT INTO email_address_login_tokens (email_address, token)
      VALUES (${emailAddress}, ${hashed})
    `)
  }
}

export async function getLatestEmailAddressLoginTokenHash(
  emailAddress: string,
): Promise<string | null> {
  const { rows } = await read(sql`
    SELECT token
    FROM email_address_login_tokens
    WHERE email_address = ${emailAddress}
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return (rows[0]?.token as string | null) ?? null
}

/**
 * Invalidate email domain validation cache
 */
export async function invalidateEmailDomainCaches(): Promise<void> {
  const cache = new ValkeyCache({
    prefix: 'email-domain-validation',
    ttlSeconds: 3_600,
  })

  await cache.invalidate()
}
