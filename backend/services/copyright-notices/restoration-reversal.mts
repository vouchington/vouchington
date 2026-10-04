import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { getImagePlacementForCopyright, getImagePlacementKey } from '@services/images/placements'
import type { CopyrightActionIntentRecord } from './types.mts'
import { removeCopyrightStaydownEntryInTransaction } from './staydown-registration.mts'
import { anyReversalSourceSql } from './restriction-reversal-sources-sql.mts'

export async function createCopyrightRestoreIntentForReversalInTransaction(
  restrictionId: string,
  transaction: TransactionQuery,
): Promise<CopyrightActionIntentRecord> {
  const { rows: placementRows } = await transaction<{ placement_id: string }>(sql`
    /* createCopyrightRestoreIntentForReversalInTransaction:findPlacement */
    SELECT target.placement_id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ${restrictionId}
  `)
  const targetPlacement = placementRows[0]
  assert(targetPlacement, 404, 'Copyright restriction not found')
  await transaction(sql`/* createCopyrightRestoreIntentForReversalInTransaction:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${getImagePlacementKey(targetPlacement.placement_id)}, 0))
  `)
  const { rows } = await transaction<{
    copyright_notice_id: string
    placement_id: string
    reversal_authorized: boolean
    lifted_at: Date | null
  }>(
    sql`/* createCopyrightRestoreIntentForReversalInTransaction:lock */
    SELECT notice.id AS copyright_notice_id, target.placement_id, restriction.lifted_at, `.append(
      anyReversalSourceSql,
    ).append(sql` AS reversal_authorized
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notices notice ON notice.id = target.copyright_notice_id
    WHERE restriction.id = ${restrictionId}
    FOR UPDATE OF notice, target, restriction
  `),
  )
  const restriction = rows[0]
  assert(restriction, 404, 'Copyright restriction not found')
  assert(
    restriction.reversal_authorized && restriction.lifted_at === null,
    409,
    'Copyright restriction is not awaiting reversal delivery',
  )
  // A reversed restriction no longer vouches for the image, so staydown stops without waiting for
  // the restore action to be delivered.
  await removeCopyrightStaydownEntryInTransaction(restrictionId, transaction)
  const placement = await getImagePlacementForCopyright(restriction.placement_id, {
    query: transaction,
  })
  assert(placement, 409, 'Copyright placement is unavailable')
  const { rows: intentRows } = await transaction<CopyrightActionIntentRecord>(sql`
    /* createCopyrightRestoreIntentForReversalInTransaction */
    INSERT INTO copyright_notice_action_intents (
      copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
    ) VALUES (${restrictionId}, NULL, ${placement.revision}, 'restore')
    ON CONFLICT (copyright_restriction_id, expected_placement_revision, action)
    DO UPDATE SET updated_at = copyright_notice_action_intents.updated_at
    RETURNING id, copyright_restriction_id, copyright_notice_deadline_id,
      expected_placement_revision, action, completed_at
  `)
  const intent = intentRows[0]
  assert(intent, 500, 'Copyright reversal restore intent was not recorded')
  await transaction(sql`/* createCopyrightRestoreIntentForReversalInTransaction:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_action_intent_id)
    VALUES (${restriction.copyright_notice_id}, 'reversal_restoration_intent_created', ${intent.id})
  `)
  return intent
}
