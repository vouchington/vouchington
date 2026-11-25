import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUuid } from '../seed-data/common.mts'

const OWNER_HISTORY = 175
const BACKGROUND_OWNERS = 320

export async function seedAccountMembershipHistory() {
  // Membership ledger entries cannot be deleted. These identities make the late-run fixture idempotent.
  const userIds = Array.from({ length: BACKGROUND_OWNERS + 1 }, (_, n) =>
    seedUuid(850_000 + n, '01'),
  )
  const membershipIds = userIds.map((_, n) => seedUuid(850_000 + n, '32'))
  const products = [seedUuid(850_000, '30'), seedUuid(850_001, '30')]
  const ownerId = userIds[0]!
  await using query = await beginTransaction()
  await query(sql`/* seedAccountMembershipOwners */
    INSERT INTO users (id, username)
    SELECT id, 'explain-history-' || n FROM unnest(${userIds}::uuid[]) WITH ORDINALITY AS input(id, n)
    ON CONFLICT (id) DO NOTHING`)
  await query(sql`/* seedAccountMembershipIdentities */
    INSERT INTO retained_membership_identities (id)
    SELECT id FROM unnest(${membershipIds}::uuid[]) AS input(id)
    ON CONFLICT (id) DO NOTHING`)
  await query(sql`/* seedAccountMembershipProducts */
    INSERT INTO membership_products (id, plan, billing_interval, retired_at)
    VALUES (${products[0]}, 'plus', 'monthly', CURRENT_TIMESTAMP),
      (${products[1]}, 'pro', 'yearly', CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING`)
  const historyIds = Array.from({ length: OWNER_HISTORY }, (_, n) => seedUuid(850_000 + n, '34'))
  await query(sql`/* seedAccountMembershipChanges */
    INSERT INTO membership_changes (id, membership_id, user_id, change_type,
      from_membership_product_id, to_membership_product_id)
    SELECT id, ${membershipIds[0]}, ${ownerId},
      CASE WHEN n % 3 = 0 THEN 'upgrade'::membership_change_types
        WHEN n % 3 = 1 THEN 'renewal' ELSE 'downgrade' END,
      CASE WHEN n % 3 = 2 THEN ${products[1]}::uuid ELSE ${products[0]}::uuid END,
      CASE WHEN n % 3 = 0 THEN ${products[1]}::uuid ELSE ${products[0]}::uuid END
    FROM unnest(${historyIds}::uuid[]) WITH ORDINALITY AS input(id, n)
    ON CONFLICT (id) DO NOTHING`)
  const backgroundChangeIds = Array.from({ length: BACKGROUND_OWNERS * 12 }, (_, n) =>
    seedUuid(851_000 + n, '34'),
  )
  await query(sql`/* seedAccountMembershipBackground */
    INSERT INTO membership_changes (id, membership_id, user_id, change_type, to_membership_product_id)
    SELECT id, owner.membership_id, owner.user_id, 'renewal', ${products[0]}
    FROM unnest(${backgroundChangeIds}::uuid[]) WITH ORDINALITY AS change(id, n)
    JOIN unnest(${userIds.slice(1)}::uuid[], ${membershipIds.slice(1)}::uuid[])
      WITH ORDINALITY AS owner(user_id, membership_id, slot) ON owner.slot = (change.n - 1) / 12 + 1
    ON CONFLICT (id) DO NOTHING`)
  await query.commit()
  return { ownerId, ids: historyIds.toReversed() }
}

export async function seedAccountReferralFixture() {
  const tag = `explain-referral-${randomUUID().slice(0, 8)}`
  const hostname = `${tag}.explain.test`
  await using query = await beginTransaction()
  const { rows: ownerRows } = await query<{ id: string }>(sql`/* seedAccountReferralUsers */
    INSERT INTO users (username) SELECT ${tag} || '-' || n FROM generate_series(0, ${BACKGROUND_OWNERS}) n
    RETURNING id`)
  const userIds = ownerRows.map(row => row.id)
  const [ownerId, referredUserId] = userIds
  if (!ownerId || !referredUserId) throw new Error('Missing referral fixture subjects')
  const { rows: programs } = await query<{ id: string }>(sql`/* seedAccountReferralTopic */
    INSERT INTO topics (topic_type, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
    VALUES ('referral_program', 'Account capacity referral program', ${tag}, 'system',
      sha256(${tag}::bytea)) RETURNING id`)
  const programId = programs[0]?.id
  if (!programId) throw new Error('Missing referral fixture program')
  await query(sql`/* seedAccountReferralProgram */
    INSERT INTO referral_program_topics (topic_id, enabled_at) VALUES (${programId}, CURRENT_TIMESTAMP)`)
  const { rows: hostnames } = await query<{ id: string }>(sql`/* seedAccountReferralHostname */
    INSERT INTO url_hostnames (hostname) VALUES (${hostname}) RETURNING id`)
  const hostnameId = hostnames[0]?.id
  if (!hostnameId) throw new Error('Missing referral fixture hostname')
  const { rows: urls } = await query<{ id: string }>(sql`/* seedAccountReferralUrls */
    INSERT INTO urls (url, hostname_id, pathname, search_params)
    SELECT ${`https://${hostname}/`} || n, ${hostnameId}, '/' || n, '{}'::jsonb
    FROM generate_series(1, 200) n RETURNING id`)
  const urlIds = urls.map(url => url.id)
  const { rows: links } = await query<{ id: string; user_id: string; deleted_at: Date | null }>(sql`
    /* seedAccountReferralLinks */
    INSERT INTO user_referral_program_links (user_id, referral_program_topic_id, url_id, created_via,
      activated_at, deactivated_at, deleted_at)
    SELECT user_id, ${programId}, url_id, 'system',
      CASE WHEN slot % 5 < 3 THEN CURRENT_TIMESTAMP END,
      CASE WHEN slot % 5 = 3 THEN CURRENT_TIMESTAMP END,
      CASE WHEN slot % 13 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${userIds}::uuid[]) AS owners(user_id)
    CROSS JOIN unnest(${urlIds}::uuid[]) WITH ORDINALITY AS links(url_id, slot)
    WHERE user_id = ${ownerId} OR slot <= 8
    RETURNING id, user_id, deleted_at`)
  const { rows: clicks } = await query<{ id: string; referrer_user_id: string }>(sql`
    /* seedAccountReferralClicks */
    INSERT INTO session_referral_attributions (session_id, referrer_user_id, user_id, landing_url, signed_up_at)
    SELECT gen_random_uuid(), referrer_id, CASE WHEN n % 4 = 0 AND referrer_id = ${ownerId}
      THEN ${referredUserId}::uuid END, ${`https://${hostname}/`} || n,
      CASE WHEN n % 4 = 0 AND referrer_id = ${ownerId} THEN CURRENT_TIMESTAMP END
    FROM unnest(${userIds}::uuid[]) AS referrers(referrer_id)
    CROSS JOIN generate_series(1, CASE WHEN referrer_id = ${ownerId} THEN ${OWNER_HISTORY} ELSE 15 END) n
    RETURNING id, referrer_user_id`)
  await query.commit()
  return {
    ownerId,
    userIds,
    hostnameId,
    urlIds,
    programId,
    clickIds: clicks.map(row => row.id),
    ownerLinkIds: links
      .filter(row => row.user_id === ownerId && row.deleted_at === null)
      .map(row => row.id)
      .toSorted((left, right) => right.localeCompare(left)),
    ownerClickIds: clicks
      .filter(row => row.referrer_user_id === ownerId)
      .map(row => row.id)
      .toSorted((left, right) => right.localeCompare(left)),
  }
}

export async function deleteAccountReferralFixture(
  fixture: Awaited<ReturnType<typeof seedAccountReferralFixture>>,
) {
  await using query = await beginTransaction()
  await query(sql`/* deleteAccountReferralClicks */ DELETE FROM session_referral_attributions
    WHERE id = ANY(${fixture.clickIds}::uuid[])`)
  await query(sql`/* deleteAccountReferralLinks */ DELETE FROM user_referral_program_links
    WHERE referral_program_topic_id = ${fixture.programId}`)
  await query(
    sql`/* deleteAccountReferralUrls */ DELETE FROM urls WHERE id = ANY(${fixture.urlIds}::uuid[])`,
  )
  await query(
    sql`/* deleteAccountReferralHostname */ DELETE FROM url_hostnames WHERE id = ${fixture.hostnameId}`,
  )
  await query(
    sql`/* deleteAccountReferralTopic */ DELETE FROM topics WHERE id = ${fixture.programId}`,
  )
  await query(
    sql`/* deleteAccountReferralTopicIdentity */ DELETE FROM retained_topic_identities WHERE id = ${fixture.programId}`,
  )
  await query(
    sql`/* deleteAccountReferralUsers */ DELETE FROM users WHERE id = ANY(${fixture.userIds}::uuid[])`,
  )
  await query(sql`/* deleteAccountReferralUserIdentities */ DELETE FROM retained_user_identities
    WHERE id = ANY(${fixture.userIds}::uuid[])`)
  await query.commit()
  await write(
    '/* restoreAccountReferralStats */ VACUUM (ANALYZE) user_referral_program_links, session_referral_attributions',
  )
}
