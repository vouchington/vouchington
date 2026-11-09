import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const COPYRIGHT_ACCEPTED_PAGE_NOTICE_COUNT = 125
export const COPYRIGHT_ACCEPTED_PAGE_TARGETS_PER_NOTICE = 10
export const COPYRIGHT_ACCEPTED_PAGE_TIMESTAMP = '2099-01-01T00:00:00.000000Z'
const FIXTURE_BASE = 2_300_000
const noticeIds = Array.from({ length: COPYRIGHT_ACCEPTED_PAGE_NOTICE_COUNT }, (_, index) =>
  seedUuid(FIXTURE_BASE + index, 'd1'),
)

/** Every fifth accepted case has no targets; the remaining cases share the same sort timestamp. */
export const COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS = noticeIds
  .filter((_, index) => index % 5 !== 0)
  .toSorted()
  .toReversed()

const targetNoticeIds = COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS.flatMap(id =>
  Array.from({ length: COPYRIGHT_ACCEPTED_PAGE_TARGETS_PER_NOTICE }, () => id),
)
const targetIds = targetNoticeIds.map((_, index) => seedUuid(FIXTURE_BASE + index, 'd2'))
const imageIds = targetNoticeIds.map((_, index) => seedUuid(FIXTURE_BASE + index, 'd3'))
const placementIds = targetNoticeIds.map((_, index) => seedUuid(FIXTURE_BASE + index, 'd4'))

export async function seedCopyrightAcceptedPages(): Promise<void> {
  await using transaction = await beginTransaction()
  const { rows: existing } = await transaction<{ occupied: boolean }>(
    `/* checkCopyrightAcceptedPagesOwnership */ SELECT
      EXISTS (SELECT 1 FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])) OR
      EXISTS (SELECT 1 FROM retained_image_identities WHERE id = ANY($2::uuid[])) OR
      EXISTS (SELECT 1 FROM retained_image_placement_bindings WHERE placement_id = ANY($3::uuid[]))
      AS occupied`,
    [noticeIds, imageIds, placementIds],
  )
  if (existing[0]?.occupied) throw new Error('Copyright accepted fixture identities already exist')
  await transaction(
    `/* seedCopyrightAcceptedPages:notices */ INSERT INTO copyright_notices
       (id, jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext,
        work_description, policy_version)
     SELECT id, 'us_dmca', 'copyright', $2::timestamptz, $2::timestamptz,
       'v1:explain-contact', 'Accepted page fixture', 'explain-v1'
     FROM unnest($1::uuid[]) item(id) ON CONFLICT DO NOTHING`,
    [noticeIds, COPYRIGHT_ACCEPTED_PAGE_TIMESTAMP],
  )
  await transaction(
    `/* seedCopyrightAcceptedPages:images */ INSERT INTO retained_image_identities (id, created_by_id)
     SELECT id, $2::uuid FROM unnest($1::uuid[]) item(id) ON CONFLICT DO NOTHING`,
    [imageIds, seedUuid(0, '01')],
  )
  await transaction(
    `/* seedCopyrightAcceptedPages:placements */ INSERT INTO retained_image_placement_bindings
       (placement_id, image_id, binding_family)
     SELECT placement_id, image_id, 'post'
     FROM unnest($1::uuid[], $2::uuid[]) item(placement_id, image_id) ON CONFLICT DO NOTHING`,
    [placementIds, imageIds],
  )
  await transaction(
    `/* seedCopyrightAcceptedPages:targets */ INSERT INTO copyright_notice_targets
       (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
     SELECT id, notice_id, placement_id, 1, 'https://example.test/explain-accepted'
     FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) item(id, notice_id, placement_id)
     ON CONFLICT DO NOTHING`,
    [targetIds, targetNoticeIds, placementIds],
  )
  await transaction(
    '/* seedCopyrightAcceptedPages:analyze */ ANALYZE copyright_notices, copyright_notice_targets',
  )
  await transaction.commit()
}

/** Remove only the fixture's cases and retained identities, then restore planner statistics. */
export async function cleanupCopyrightAcceptedPages(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* cleanupCopyrightAcceptedPages:ownedIds */
     SELECT set_config('app.explain_copyright_page_notice_ids', $1::uuid[]::text, true)`,
    [noticeIds],
  )
  // Purge guards require a separate case scope for each delete; run that fixed loop in the server.
  await transaction(`/* cleanupCopyrightAcceptedPages:cases */
    DO $cleanup$
    DECLARE notice_id uuid;
    BEGIN
      FOREACH notice_id IN ARRAY current_setting('app.explain_copyright_page_notice_ids')::uuid[] LOOP
        PERFORM set_config('app.copyright_case_purge_notice_id', notice_id::text, true);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_targets', true);
        DELETE FROM copyright_notice_targets WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notices', true);
        DELETE FROM copyright_notices WHERE id = notice_id;
      END LOOP;
    END;
    $cleanup$`)
  await transaction(
    '/* cleanupCopyrightAcceptedPages:noticeIdentities */ DELETE FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])',
    [noticeIds],
  )
  await transaction(
    '/* cleanupCopyrightAcceptedPages:placements */ DELETE FROM retained_image_placement_bindings WHERE placement_id = ANY($1::uuid[])',
    [placementIds],
  )
  await transaction(
    '/* cleanupCopyrightAcceptedPages:images */ DELETE FROM retained_image_identities WHERE id = ANY($1::uuid[])',
    [imageIds],
  )
  await transaction(
    '/* cleanupCopyrightAcceptedPages:analyze */ ANALYZE copyright_notices, copyright_notice_targets',
  )
  await transaction.commit()
}
