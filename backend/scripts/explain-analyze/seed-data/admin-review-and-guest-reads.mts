import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUuidAtTimestamp } from './common.mts'

const POST_BASE = 3_700_000
const NOTICE_BASE = 3_730_000
const CAPABILITY_BASE = 3_740_000
const FIXTURE_TIME = Date.UTC(2098, 0, 1)
const ADMIN_REVIEW_FIXTURE_COUNT = 201
export const ASSOCIATION_FIXTURE_COUNT = 2_001
export const GUEST_CAPABILITY_FIXTURE_COUNT = 101

export const ADMIN_REVIEW_FIXTURE_IDS = Array.from(
  { length: ADMIN_REVIEW_FIXTURE_COUNT },
  (_, index) => seedUuidAtTimestamp(FIXTURE_TIME, POST_BASE + index),
)
  .toSorted()
  .toReversed()
export const ASSOCIATION_FIXTURE_IDS = Array.from(
  { length: ASSOCIATION_FIXTURE_COUNT },
  (_, index) => seedUuidAtTimestamp(FIXTURE_TIME, NOTICE_BASE + index),
)
  .toSorted()
  .toReversed()
export const GUEST_CAPABILITY_FIXTURE_IDS = Array.from(
  { length: GUEST_CAPABILITY_FIXTURE_COUNT },
  (_, index) => seedUuidAtTimestamp(FIXTURE_TIME, CAPABILITY_BASE + index),
)
  .toSorted()
  .toReversed()

const backgroundCapabilityIds = Array.from({ length: 400 }, (_, index) =>
  seedUuidAtTimestamp(
    FIXTURE_TIME,
    index < 200
      ? CAPABILITY_BASE - 200 + index
      : CAPABILITY_BASE + GUEST_CAPABILITY_FIXTURE_COUNT + index,
  ),
)
const allCapabilityIds = [...GUEST_CAPABILITY_FIXTURE_IDS, ...backgroundCapabilityIds]
const capabilityNoticeIds = allCapabilityIds.map(
  (_, index) =>
    ASSOCIATION_FIXTURE_IDS[index < GUEST_CAPABILITY_FIXTURE_COUNT ? 0 : 1 + (index % 25)]!,
)
export const GUEST_CAPABILITY_SEEDED_ROWS = allCapabilityIds.length
export const ASSOCIATION_QUERY = 'association-6374-explain-fixture'
const ASSOCIATION_CLAIMANT_ID = seedUuidAtTimestamp(FIXTURE_TIME, NOTICE_BASE - 1)
// The association scan is global. Its terminal-page fixture reserves the two lowest UUIDv7 IDs
// so arbitrary older notices from other scenarios cannot consume its candidate budget.
export const ASSOCIATION_TERMINAL_CURSOR_ID = seedUuidAtTimestamp(0, 1)
export const ASSOCIATION_TERMINAL_NOTICE_ID = seedUuidAtTimestamp(0, 0)
const associationNoticeIds = [...ASSOCIATION_FIXTURE_IDS, ASSOCIATION_TERMINAL_NOTICE_ID]
export const ASSOCIATION_MATCH_IDS = ASSOCIATION_FIXTURE_IDS.filter((_, index) => index % 5 !== 4)

/** Idempotent, token-free fixtures for explain runs against the disposable analysis database. */
export async function seedAdminReviewAndGuestReadFixtures(seedUserId: string): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows: retained } = await transaction<{ fixture_is_partial: boolean }>(
    `/* checkAssociationSearchFixtureOwnership */ SELECT EXISTS (
       SELECT 1 FROM unnest($1::uuid[]) fixture(id)
       JOIN retained_copyright_notice_identities retained ON retained.id = fixture.id
       LEFT JOIN copyright_notices notice ON notice.id = fixture.id
       WHERE notice.id IS NULL
     ) AS fixture_is_partial`,
    [associationNoticeIds],
  )
  if (retained[0]?.fixture_is_partial)
    throw new Error('Association search fixture has a retained identity without its notice')

  await transaction(
    `/* seedAdminReviewReadPosts */ INSERT INTO posts (
       id, created_by_id, post_type, title, markdown, created_via,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256, rejected_at
     ) SELECT id, $2::uuid, 'discussion', 'Review queue explain fixture',
       'Review queue explain fixture body', 'system', decode(repeat('00', 32), 'hex'),
       decode(repeat('00', 32), 'hex'), '2098-01-01T00:00:00Z'::timestamptz
     FROM unnest($1::uuid[]) AS fixture(id) ON CONFLICT (id) DO NOTHING`,
    [ADMIN_REVIEW_FIXTURE_IDS, seedUserId],
  )
  await transaction(
    `/* seedAssociationSearchClaimant */ INSERT INTO users (id, username)
     VALUES ($1, 'seed-association-search-claimant') ON CONFLICT (id) DO NOTHING`,
    [ASSOCIATION_CLAIMANT_ID],
  )
  await transaction(
    `/* seedAssociationSearchNotices */ INSERT INTO copyright_notices (
       id, jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
       claimant_display_name, work_description, policy_version, claimant_user_id
     ) SELECT fixture.id, 'us_dmca', 'copyright', '2098-01-01T00:00:00Z'::timestamptz,
       'explain-fixture-contact',
       CASE WHEN fixture.id = ANY($2::uuid[]) THEN $3 ELSE 'Other notice' END,
       'Explain association search work', 'explain-v1', $4::uuid
     FROM unnest($1::uuid[]) AS fixture(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM retained_copyright_notice_identities retained WHERE retained.id = fixture.id
     )`,
    [
      associationNoticeIds,
      [...ASSOCIATION_MATCH_IDS, ASSOCIATION_TERMINAL_NOTICE_ID],
      ASSOCIATION_QUERY,
      ASSOCIATION_CLAIMANT_ID,
    ],
  )
  await transaction(
    `/* seedGuestCapabilityReadIdentities */ INSERT INTO copyright_notice_guest_capability_identities (
       id, copyright_notice_id
     ) SELECT id, notice_id FROM unnest($1::uuid[], $2::uuid[]) AS fixture(id, notice_id) ON CONFLICT (id) DO NOTHING`,
    [allCapabilityIds, capabilityNoticeIds],
  )
  const tokenHashes = allCapabilityIds.map(id =>
    createHash('sha256').update(`explain-guest-capability:${id}`).digest('hex'),
  )
  await transaction(
    `/* seedGuestCapabilityReadRows */ INSERT INTO copyright_notice_guest_capabilities (
       id, copyright_notice_id, token_hash, issued_by_id, expires_at
     ) SELECT id, notice_id, token_hash, $3::uuid,
       '2098-01-30T00:00:00Z'::timestamptz
     FROM unnest($1::uuid[], $2::uuid[], $4::text[]) AS fixture(id, notice_id, token_hash) ON CONFLICT (id) DO NOTHING`,
    [allCapabilityIds, capabilityNoticeIds, seedUserId, tokenHashes],
  )
  await transaction(
    '/* analyzeAdminReviewAndGuestReadFixtures */ ANALYZE posts, copyright_notices, copyright_notice_guest_capabilities',
  )
  await transaction.commit()
}
