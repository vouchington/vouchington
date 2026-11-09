import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Owned, tied accepted cases with two targets, no targets, and one target. */
export async function createCopyrightAcceptedPageFixture(): Promise<{
  acceptedAt: string
  noticeIds: string[]
  targetCounts: number[]
  cleanup: () => Promise<void>
}> {
  const acceptedAt = new Date(Date.UTC(1990, 0, 1) + randomInt(1_000_000_000) * 1000).toISOString()
  await using transaction = await beginTransaction()
  const { rows: users } = await transaction<{ id: string }>(
    '/* createCopyrightAcceptedPageUser */ INSERT INTO users DEFAULT VALUES RETURNING id',
  )
  const userId = users[0]!.id
  const { rows: notices } = await transaction<{ id: string }>(sql`
    /* createCopyrightAcceptedPageNotices */
    INSERT INTO copyright_notices
      (jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext, work_description, policy_version)
    SELECT 'us_dmca', 'copyright', ${acceptedAt}::timestamptz, ${acceptedAt}::timestamptz,
      'v1:test-contact', 'Owned pagination fixture', 'test-v1'
    FROM generate_series(1, 3) RETURNING id`)
  const noticeIds = notices
    .map(row => row.id)
    .toSorted()
    .toReversed()
  const { rows: images } = await transaction<{ id: string }>(sql`
    /* createCopyrightAcceptedPageImages */
    INSERT INTO retained_image_identities (id, created_by_id)
    SELECT uuidv7(), ${userId} FROM generate_series(1, 3) RETURNING id`)
  const imageIds = images.map(row => row.id)
  const { rows: placements } = await transaction<{ placement_id: string }>(sql`
    /* createCopyrightAcceptedPagePlacements */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    SELECT uuidv7(), image_id, 'post' FROM unnest(${imageIds}::uuid[]) item(image_id)
    RETURNING placement_id`)
  const placementIds = placements.map(row => row.placement_id)
  await transaction(sql`/* createCopyrightAcceptedPageTargets */
    INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
    SELECT notice_id, placement_id, 1, 'https://example.test/owned'
    FROM unnest(${[noticeIds[0], noticeIds[0], noticeIds[2]]}::uuid[], ${placementIds}::uuid[])
      item(notice_id, placement_id)`)
  await transaction.commit()
  return {
    acceptedAt,
    noticeIds,
    targetCounts: [2, 0, 1],
    cleanup: async () => {
      await using cleanup = await beginTransaction()
      for (const noticeId of noticeIds) {
        await cleanup(sql`/* cleanupCopyrightAcceptedPageTargets */
          SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
            set_config('app.copyright_case_purge_table', 'copyright_notice_targets', true)`)
        await cleanup(sql`/* cleanupCopyrightAcceptedPageTargets:delete */
          DELETE FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId}`)
        await cleanup(sql`/* cleanupCopyrightAcceptedPageNotice */
          SELECT set_config('app.copyright_case_purge_table', 'copyright_notices', true)`)
        await cleanup(sql`/* cleanupCopyrightAcceptedPageNotice:delete */
          DELETE FROM copyright_notices WHERE id = ${noticeId}`)
      }
      await cleanup(sql`/* cleanupCopyrightAcceptedPageNoticeIdentities */
        DELETE FROM retained_copyright_notice_identities WHERE id = ANY(${noticeIds}::uuid[])`)
      await cleanup(sql`/* cleanupCopyrightAcceptedPagePlacements */
        DELETE FROM retained_image_placement_bindings WHERE placement_id = ANY(${placementIds}::uuid[])`)
      await cleanup(sql`/* cleanupCopyrightAcceptedPageImages */
        DELETE FROM retained_image_identities WHERE id = ANY(${imageIds}::uuid[])`)
      await cleanup(
        sql`/* cleanupCopyrightAcceptedPageUser */ DELETE FROM users WHERE id = ${userId}`,
      )
      await cleanup.commit()
    },
  }
}
