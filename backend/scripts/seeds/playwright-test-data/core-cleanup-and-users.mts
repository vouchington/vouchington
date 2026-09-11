import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'

async function seedPlaywrightCleanupAndUsers(
  query: TransactionQuery,
  testUserEmail: string,
): Promise<void> {
  const normalizedTestEmail = testUserEmail.trim().toLowerCase()
  await query(
    `DELETE FROM rss_feed_items WHERE url_id IN ( SELECT id FROM urls WHERE hostname_id IN ( SELECT id FROM url_hostnames WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com') ) )`,
  )
  await query(
    `DELETE FROM rss_feeds WHERE rss_feed_url_id IN ( SELECT id FROM urls WHERE hostname_id IN ( SELECT id FROM url_hostnames WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com') ) ) OR topic_id IN ( '019c64e6-f8a0-7000-a000-000000000001', '019c64e6-f8a0-7000-a000-000000000002', '019c64e6-f8a0-7000-a000-000000000003' )`,
  )
  await query(
    `UPDATE topics SET hostname_id = NULL WHERE hostname_id IN ( SELECT id FROM url_hostnames WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com') )`,
  )
  await query(
    `UPDATE url_hostnames SET topic_id = NULL WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com')`,
  )
  // Delete any topic that has a playwright-reserved slug but a non-playwright id (e.g. a
  // concurrent vitest test that happened to use the same slug). Without this, the
  // ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id in post-feed-fixtures would try to
  // mutate a topics PK, which violates topic_metrics_topic_id_fkey (ON DELETE CASCADE but
  // no ON UPDATE CASCADE).
  await query(
    `DELETE FROM topic_aliases WHERE topic_id IN (SELECT id FROM topics WHERE slug IN ('test-news-source', 'credit-card-news', 'doctor-of-credit-news'))`,
  )
  await query(
    `DELETE FROM topics WHERE slug IN ('test-news-source', 'credit-card-news', 'doctor-of-credit-news')`,
  )
  // Delete link posts that reference these URLs before deleting the URLs themselves
  // (posts.url_id → urls.id has ON DELETE RESTRICT).
  await query(
    `DELETE FROM posts WHERE url_id IN ( SELECT id FROM urls WHERE hostname_id IN ( SELECT id FROM url_hostnames WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com') ) )`,
  )
  await query(
    `DELETE FROM urls WHERE hostname_id IN ( SELECT id FROM url_hostnames WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com') )`,
  )
  await query(
    `DELETE FROM url_hostnames WHERE hostname IN ('example.com', 'test.org', 'blocked-site.com', 'www.doctorofcredit.com', 'thepointsguy.com')`,
  )
  await query(
    `UPDATE users SET username = 'tests-legacy-nil-id' WHERE id = '00000000-0000-0000-0000-000000000000' AND LOWER(username) = 'tests'`,
  )
  await query(
    `INSERT INTO users (id, username) VALUES ('019f0000-0000-7000-8000-000000000000', 'tests') ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
  )
  await query(
    `INSERT INTO users (id, username) VALUES ('00000000-0000-0000-0000-000000000001', 'test-friend') ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
  )
  await query(
    `INSERT INTO users (id, username) VALUES ('00000000-0000-0000-0000-000000000002', 'blocked-friend'), ('00000000-0000-0000-0000-000000000003', 'muted-friend') ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
  )
  await query(
    `INSERT INTO user_roles (user_id, role_type_id) SELECT '019f0000-0000-7000-8000-000000000000', id FROM user_roles_types WHERE slug = 'administrator' ON CONFLICT (user_id, role_type_id) DO NOTHING`,
  )
  await query(`DELETE FROM user_passkeys WHERE user_id = '019f0000-0000-7000-8000-000000000000'`)
  await query(
    `DELETE FROM user_totp_authenticators WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE facebook_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE apple_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE google_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE x_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE linkedin_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE microsoft_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  await query(
    `UPDATE github_accounts SET user_id = NULL WHERE user_id = '019f0000-0000-7000-8000-000000000000'`,
  )
  // Demote stale primary rows for the test user (random emails accumulate across repeated runs)
  await query(
    `UPDATE user_email_addresses SET is_primary = FALSE WHERE user_id = '019f0000-0000-7000-8000-000000000000' AND is_primary = TRUE`,
  )
  // Delete any other user's row for this email so lookups uniquely identify the test user
  await query(
    `DELETE FROM user_email_addresses WHERE email_address = $1 AND user_id <> '019f0000-0000-7000-8000-000000000000'`,
    [normalizedTestEmail],
  )
  await query(
    `INSERT INTO user_email_addresses (user_id, email_address, is_primary) VALUES ('019f0000-0000-7000-8000-000000000000', $1, TRUE) ON CONFLICT (user_id, email_address) DO UPDATE SET is_primary = TRUE`,
    [normalizedTestEmail],
  )
  {
    const seedHash = hashToken('email-address-login-token', 'playwright-test-user-seed-token')
    await query(
      `INSERT INTO email_address_login_tokens (email_address, token, logged_in_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (token) DO UPDATE SET email_address = EXCLUDED.email_address, logged_in_at = EXCLUDED.logged_in_at`,
      [normalizedTestEmail, seedHash],
    )
  }
}

export { seedPlaywrightCleanupAndUsers }
