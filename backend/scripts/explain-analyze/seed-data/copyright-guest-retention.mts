import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuidAtTimestamp } from './common.mts'

const DAY_MS = 86_400_000
// Advance the sweep cutoff past the database's insert clock to exercise expiry preservation.
const CUTOFF_MS = (Math.floor(Date.now() / DAY_MS) + 6) * DAY_MS
const NOTICE_TIME = CUTOFF_MS - 70 * DAY_MS
const FIXTURE_BASE = 6_374_000
const CAPABILITIES_PER_NOTICE = 8
const BACKGROUND_PER_SIDE = 2_000
const ANALYZE_FIXTURE = `/* analyzeCopyrightGuestRetentionFixtures */
  ANALYZE copyright_notices, copyright_notice_guest_capability_identities,
    copyright_notice_guest_capabilities, copyright_notice_submissions,
    copyright_notice_thread_retention_activities`

function capability(
  index: number,
  issuedAt: number,
  expiry: number,
  noticeIndex: number,
  options: { revoked?: boolean; protected?: boolean } = {},
) {
  const id = seedUuidAtTimestamp(issuedAt, FIXTURE_BASE + index)
  const expiryAt = new Date(expiry)
  return {
    id,
    noticeId: seedUuidAtTimestamp(NOTICE_TIME, FIXTURE_BASE + noticeIndex),
    expiryAt,
    revoked: options.revoked === true,
    submissionId: options.protected
      ? seedUuidAtTimestamp(issuedAt + DAY_MS, FIXTURE_BASE + index)
      : null,
  }
}

/** Populate one raw retention page and the next eligible row among older and newer capabilities. */
export async function seedCopyrightGuestRetentionFixtures(batchSize: number) {
  const issuedAt = CUTOFF_MS - 10 * DAY_MS
  const unexpiredIndex = Math.floor(batchSize / 2)
  const firstPage = Array.from({ length: batchSize }, (_, index) =>
    capability(
      index + 1,
      issuedAt,
      index === unexpiredIndex ? CUTOFF_MS + 10 * DAY_MS : CUTOFF_MS - index * 1000,
      Math.floor(index / CAPABILITIES_PER_NOTICE),
      { revoked: index < CAPABILITIES_PER_NOTICE && index !== 1, protected: index === 1 },
    ),
  )
  const protectedCapability = firstPage[1]!
  const unexpiredCapability = firstPage[unexpiredIndex]!
  const nextPage = capability(batchSize + 1, issuedAt, CUTOFF_MS, batchSize)
  const older = Array.from({ length: BACKGROUND_PER_SIDE }, (_, index) =>
    capability(
      batchSize + index + 2,
      CUTOFF_MS - (45 + (index % 15)) * DAY_MS,
      CUTOFF_MS - (25 + (index % 15)) * DAY_MS,
      batchSize + 1 + Math.floor(index / CAPABILITIES_PER_NOTICE),
      { protected: index % 3 === 0 },
    ),
  )
  const recent = Array.from({ length: BACKGROUND_PER_SIDE }, (_, index) =>
    capability(
      batchSize + BACKGROUND_PER_SIDE + index + 2,
      CUTOFF_MS + (1 + (index % 15)) * DAY_MS,
      CUTOFF_MS + (21 + (index % 15)) * DAY_MS,
      batchSize +
        1 +
        Math.ceil(BACKGROUND_PER_SIDE / CAPABILITIES_PER_NOTICE) +
        Math.floor(index / CAPABILITIES_PER_NOTICE),
      { protected: index % 3 === 0 },
    ),
  )
  const capabilities = [...firstPage, nextPage, ...older, ...recent]
  const allIds = capabilities.map(row => row.id)
  const noticeIds = [...new Set(capabilities.map(row => row.noticeId))]
  const submissions = capabilities.flatMap(row =>
    row.submissionId === null
      ? []
      : [{ id: row.submissionId, noticeId: row.noticeId, capabilityId: row.id }],
  )

  const expired = firstPage.filter(
    row => row !== protectedCapability && row !== unexpiredCapability,
  )
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCopyrightGuestRetentionNotices */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, last_legal_activity_at,
       claimant_contact_ciphertext, work_description, policy_version)
    SELECT id, 'us_dmca', 'copyright', $2::timestamptz, $2::timestamptz,
      'v1:explain-contact', 'Guest retention fixture', 'explain-v1'
    FROM unnest($1::uuid[]) AS fixture(id)`,
    [noticeIds, new Date(NOTICE_TIME)],
  )
  await transaction(
    `/* seedCopyrightGuestRetentionIdentities */
    INSERT INTO copyright_notice_guest_capability_identities (id, copyright_notice_id)
    SELECT id, notice_id FROM unnest($1::uuid[], $2::uuid[]) AS fixture(id, notice_id)`,
    [allIds, capabilities.map(row => row.noticeId)],
  )
  const { rows: inserted } = await transaction<{ updated_at: Date }>(
    `/* seedCopyrightGuestRetentionCapabilities */
    INSERT INTO copyright_notice_guest_capabilities
      (id, copyright_notice_id, token_hash, expires_at, revoked_at)
    SELECT id, notice_id, token_hash, expires_at, CASE WHEN revoked THEN CURRENT_TIMESTAMP END
    FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::timestamptz[], $5::boolean[])
      AS fixture(id, notice_id, token_hash, expires_at, revoked)
    RETURNING updated_at`,
    [
      allIds,
      capabilities.map(row => row.noticeId),
      allIds.map(id => contentHash(`explain-copyright-guest-retention:${id}`).toString('hex')),
      capabilities.map(row => row.expiryAt),
      capabilities.map(row => row.revoked),
    ],
  )
  await transaction(
    `/* seedCopyrightGuestRetentionSubmissions */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, copyright_notice_guest_capability_id, kind, received_at,
       source_kind, body_ciphertext)
    SELECT id, notice_id, capability_id, 'supplement', uuid_extract_timestamp(id),
      'guest_form', 'v1:explain-body'
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS fixture(id, notice_id, capability_id)`,
    [
      submissions.map(row => row.id),
      submissions.map(row => row.noticeId),
      submissions.map(row => row.capabilityId),
    ],
  )
  await transaction(ANALYZE_FIXTURE)
  await transaction.commit()

  const updatedAt = inserted[0]!.updated_at
  const activitiesByNotice = new Map<string, Date>()
  for (const row of expired) {
    const clock = row.revoked || row.expiryAt < updatedAt ? updatedAt : row.expiryAt
    if (clock > (activitiesByNotice.get(row.noticeId) ?? new Date(0))) {
      activitiesByNotice.set(row.noticeId, clock)
    }
  }
  return {
    cutoff: new Date(CUTOFF_MS),
    firstPageIds: firstPage.map(row => row.id),
    expiredIds: expired.map(row => row.id),
    nextPageId: nextPage.id,
    unexpiredId: unexpiredCapability.id,
    protectedId: protectedCapability.id,
    protectedSubmissionId: protectedCapability.submissionId!,
    allIds,
    noticeIds,
    expectedActivities: Array.from(activitiesByNotice, ([noticeId, lastActivityAt]) => ({
      noticeId,
      lastActivityAt,
    })),
    seededRows: { capabilities: allIds.length, submissions: submissions.length },
    cleanup: () => cleanupCopyrightGuestRetentionFixtures(noticeIds),
  }
}

/** Purge only the fixture cases, honoring the existing per-case delete permits. */
async function cleanupCopyrightGuestRetentionFixtures(noticeIds: readonly string[]): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* cleanupCopyrightGuestRetentionFixtures:ownedIds */
    SELECT set_config('app.explain_copyright_guest_retention_notice_ids', $1::uuid[]::text, true)`,
    [noticeIds],
  )
  await transaction(`/* cleanupCopyrightGuestRetentionFixtures:cases */
    DO $cleanup$
    DECLARE notice_id uuid;
    BEGIN
      FOREACH notice_id IN ARRAY
        current_setting('app.explain_copyright_guest_retention_notice_ids')::uuid[] LOOP
        PERFORM set_config('app.copyright_case_purge_notice_id', notice_id::text, true);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true);
        DELETE FROM copyright_notice_submissions WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_guest_capabilities', true);
        DELETE FROM copyright_notice_guest_capabilities WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_guest_capability_identities', true);
        DELETE FROM copyright_notice_guest_capability_identities WHERE copyright_notice_id = notice_id;
        DELETE FROM copyright_notice_thread_retention_activities WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notices', true);
        DELETE FROM copyright_notices WHERE id = notice_id;
      END LOOP;
    END;
    $cleanup$`)
  await transaction(
    `/* cleanupCopyrightGuestRetentionFixtures:noticeIdentities */
    DELETE FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])`,
    [noticeIds],
  )
  await transaction(ANALYZE_FIXTURE)
  await transaction.commit()
}
