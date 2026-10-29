import { beginTransaction } from '@data-stores/psql'
import { PARTITION_DROP_POLICIES } from '@data-stores/psql/config-driven/utils/partition-drop-policies'
import {
  getPartitionDropRefusal,
  getPartitionDropStatusRefusals,
} from '@data-stores/psql/migration-runner/partition-drop-guard'
import { buildMonthlyPartitionName } from '@vouchington/postgres/partitions'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

type Party =
  | 'unrelated'
  | 'reviewer'
  | 'claimant'
  | 'submitter'
  | 'incident'
  | 'placement'
  | 'repeat'

async function insertActor(query: TransactionQuery): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* copyrightHistoryHoldSceneActor */
    INSERT INTO users DEFAULT VALUES RETURNING id`)
  return rows[0]!.id
}

async function insertNotice(
  query: TransactionQuery,
  at: Date,
  claimantId: string | null,
): Promise<string> {
  const { rows } = await query<{ id: string }>(sql`/* copyrightHistoryHoldSceneNotice */
    INSERT INTO copyright_notices
      (jurisdiction, legal_basis, received_at, claimant_user_id,
       claimant_contact_ciphertext, work_description, policy_version)
    VALUES ('us_dmca', 'copyright', ${at}, ${claimantId}, 'contact', 'work', 'test')
    RETURNING id`)
  return rows[0]!.id
}

/** Every history row uses an existing monthly child; the transaction rolls back all fixture DML. */
export async function withCopyrightHistoryHoldScene(
  run: (scene: {
    placeHold: (party: Party) => Promise<string>
    releaseHold: (holdId: string) => Promise<void>
    check: (
      table: 'copyright_notice_lifecycle_changes' | 'copyright_repeat_infringer_reviews',
    ) => Promise<{
      preview: string | null | undefined
      recheck: string | null
    }>
  }) => Promise<void>,
): Promise<void> {
  await using query = await beginTransaction()
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const childUpper = new Date(Date.UTC(year, month, 1))
  const lifecycle = {
    table: 'copyright_notice_lifecycle_changes',
    partition: buildMonthlyPartitionName('copyright_notice_lifecycle_changes', year, month),
    upperBound: childUpper,
  }
  const repeat = {
    table: 'copyright_repeat_infringer_reviews',
    partition: buildMonthlyPartitionName('copyright_repeat_infringer_reviews', year, month),
    upperBound: childUpper,
  }
  const at = new Date(Date.UTC(year, month - 1, 15))
  const referenceDate = new Date(
    Date.UTC(childUpper.getUTCFullYear() + 6, childUpper.getUTCMonth(), 1),
  )

  const parties = {} as Record<Party, string>
  for (const party of [
    'unrelated',
    'reviewer',
    'claimant',
    'submitter',
    'incident',
    'placement',
    'repeat',
  ] as const)
    parties[party] = await insertActor(query)

  for (const party of ['claimant', 'submitter', 'incident', 'placement'] as const) {
    const noticeId = await insertNotice(query, at, party === 'claimant' ? parties.claimant : null)
    if (party === 'submitter')
      await query(sql`/* copyrightHistoryHoldSceneSubmission */
        INSERT INTO copyright_notice_submissions
          (copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext)
        VALUES (${noticeId}, ${parties.submitter}, 'notice', ${at}, 'staff', 'body')`)
    if (party === 'incident')
      await query(sql`/* copyrightHistoryHoldSceneIncident */
        INSERT INTO copyright_repeat_infringer_incidents
          (account_user_id, copyright_notice_id, is_operative)
        VALUES (${parties.incident}, ${noticeId}, false)`)
    if (party === 'placement') {
      const imageId = uuidv7()
      const placementId = uuidv7()
      await query(sql`/* copyrightHistoryHoldSceneImageIdentity */
        INSERT INTO retained_image_identities (id, created_by_id)
        VALUES (${imageId}, ${parties.placement})`)
      await query(sql`/* copyrightHistoryHoldScenePlacementBinding */
        INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
        VALUES (${placementId}, ${imageId}, 'surface')`)
      await query(sql`/* copyrightHistoryHoldSceneMediaPlacement */
        INSERT INTO media_placements (id) VALUES (${placementId})`)
      await query(sql`/* copyrightHistoryHoldSceneProfilePlacement */
        INSERT INTO image_surface_placements (placement_id, surface_kind, image_id, user_id)
        VALUES (${placementId}, 'user-profile-image', ${imageId}, ${parties.placement})`)
      await query(sql`/* copyrightHistoryHoldSceneTarget */
        INSERT INTO copyright_notice_targets
          (copyright_notice_id, placement_id, placement_revision, surface_owner_user_id, hosted_use_url)
        VALUES (${noticeId}, ${placementId}, 0, ${parties.placement}, 'https://example.test/use')`)
    }
    await query(sql`/* copyrightHistoryHoldSceneLifecycle */
      INSERT INTO copyright_notice_lifecycle_changes
        (id, copyright_notice_id, change_type, changed_by_id)
      VALUES (${uuidv7({ msecs: at.getTime() })}, ${noticeId}, 'notice_received', ${parties.reviewer})`)
  }

  const reviewIdentityId = uuidv7()
  await query(sql`/* copyrightHistoryHoldSceneReviewIdentity */
    INSERT INTO copyright_repeat_infringer_review_identities (id, account_user_id)
    VALUES (${reviewIdentityId}, ${parties.repeat})`)
  await query(sql`/* copyrightHistoryHoldSceneReview */
    INSERT INTO copyright_repeat_infringer_reviews
      (id, account_user_id, copyright_repeat_infringer_review_identity_id,
       opened_at, outcome, outcome_at, outcome_by_id, rationale_ciphertext)
    VALUES (${uuidv7({ msecs: at.getTime() })}, ${parties.repeat}, ${reviewIdentityId},
      ${at}, 'no_action', ${at}, ${parties.reviewer}, 'review')`)

  async function placeHold(party: Party): Promise<string> {
    const { rows } = await query<{ id: string }>(sql`/* copyrightHistoryHoldScenePlace */
      INSERT INTO user_legal_preservation_holds
        (account_user_id, placed_by_id, reference_ciphertext)
      VALUES (${parties[party]}, ${parties.reviewer}, 'test hold') RETURNING id`)
    return rows[0]!.id
  }
  async function releaseHold(holdId: string): Promise<void> {
    await query(sql`/* copyrightHistoryHoldSceneRelease */
      UPDATE user_legal_preservation_holds
      SET released_at = CURRENT_TIMESTAMP, released_by_id = ${parties.reviewer}
      WHERE id = ${holdId}`)
  }
  async function check(
    table: 'copyright_notice_lifecycle_changes' | 'copyright_repeat_infringer_reviews',
  ) {
    const candidate = table === 'copyright_notice_lifecycle_changes' ? lifecycle : repeat
    const policy = PARTITION_DROP_POLICIES[table]!
    const statuses = await getPartitionDropStatusRefusals(
      query,
      [candidate],
      { [table]: policy },
      referenceDate,
      1,
    )
    const recheck = await getPartitionDropRefusal(query, candidate, policy, referenceDate)
    return { preview: statuses.get(candidate.partition), recheck }
  }
  await run({ placeHold, releaseHold, check })
  await query.rollback()
}
