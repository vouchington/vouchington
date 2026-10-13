import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
/**
 * Email address entity helpers
 */

import { read, write, beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { upsertTestEmailDomainHostnameId, upsertTestHostnameId } from './email-domain-hostname.mts'

/**
 * Insert a verified email address for a user into user_email_addresses.
 * This simulates a user who has completed email verification.
 */
export async function addVerifiedEmailForUser(userId: string, email: string): Promise<void> {
  const emailDomainHostnameId = await upsertTestEmailDomainHostnameId(email)
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
    VALUES (${userId}, ${email}, ${emailDomainHostnameId}, false)
    ON CONFLICT (user_id, email_address) DO NOTHING
  `),
  )
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
    const emailDomainHostnameId = await upsertTestEmailDomainHostnameId(normalizedEmail, { query })
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
        INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
        VALUES (${userId}, ${normalizedEmail}, ${emailDomainHostnameId}, TRUE)
        ON CONFLICT (user_id, email_address) DO UPDATE SET
          email_domain_hostname_id = EXCLUDED.email_domain_hostname_id,
          is_primary = TRUE
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
  const { rows: sourceRows } = await write(
    allowUnannotatedQuery(sql`
    INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES ('email'::domain_blocklist_types, 'test-disposable-email', 'https://example.com/list.txt')
    ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type, url = EXCLUDED.url
    RETURNING id
  `),
  )
  const sourceId = sourceRows[0].id
  const blockedHostnameId = await upsertTestHostnameId(domain, {}, 'private_email')

  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO blocklisted_domains (source_id, domain, url_hostname_id)
    VALUES (${sourceId}, ${domain}, ${blockedHostnameId})
    ON CONFLICT (domain, source_id) DO NOTHING
  `),
  )

  const emailDomainHostnameId = await upsertTestEmailDomainHostnameId(email)
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO user_email_addresses (user_id, email_address, email_domain_hostname_id, is_primary)
    VALUES (${userId}, ${email}, ${emailDomainHostnameId}, false)
    ON CONFLICT (user_id, email_address) DO NOTHING
  `),
  )
}

/**
 * Add a disposable email domain to the blacklist without adding a user_email_addresses row.
 */
export async function addDisposableDomain(domain: string): Promise<void> {
  const { rows: sourceRows } = await write(
    allowUnannotatedQuery(sql`
    INSERT INTO domain_blocklist_sources (type, name, url)
    VALUES ('email'::domain_blocklist_types, 'test-disposable-email', 'https://example.com/list.txt')
    ON CONFLICT (name) DO UPDATE SET type = EXCLUDED.type, url = EXCLUDED.url
    RETURNING id
  `),
  )
  const sourceId = sourceRows[0].id
  const blockedHostnameId = await upsertTestHostnameId(domain, {}, 'private_email')

  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO blocklisted_domains (source_id, domain, url_hostname_id)
    VALUES (${sourceId}, ${domain}, ${blockedHostnameId})
    ON CONFLICT (domain, source_id) DO NOTHING
  `),
  )
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
    await write(
      allowUnannotatedQuery(sql`
      INSERT INTO email_address_login_tokens (email_address, token, logged_in_at)
      VALUES (${emailAddress}, ${hashed}, CURRENT_TIMESTAMP)
    `),
    )
  } else {
    await write(
      allowUnannotatedQuery(sql`
      INSERT INTO email_address_login_tokens (email_address, token)
      VALUES (${emailAddress}, ${hashed})
    `),
    )
  }
}

export async function getLatestEmailAddressLoginTokenHash(
  emailAddress: string,
): Promise<string | null> {
  const { rows } = await read(
    allowUnannotatedQuery(sql`
    SELECT token
    FROM email_address_login_tokens
    WHERE email_address = ${emailAddress}
    ORDER BY created_at DESC
    LIMIT 1
  `),
  )
  return (rows[0]?.token as string | null) ?? null
}
