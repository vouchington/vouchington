import { lockCopyrightPlacementTransitions } from './action-delivery-placement-locking.mts'
import { createCopyrightRestrictionDecisionNoticesInTransaction } from './restriction-outcome-notices.mts'
import { runSequentially } from '@modules/utils/run-sequentially'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { insertCopyrightActionIntents } from './action-intent-insertion.mts'

/** Retain the filing itself as the real ground, without claiming it has been assessed. */
export async function imposeCopyrightCourtFilingRestrictions(
  noticeId: string,
  submissionId: string,
  now: Date,
  query: TransactionQuery,
): Promise<string[]> {
  const { rows: placements } = await query<{ id: string }>(sql`
    /* imposeCopyrightCourtFilingRestrictions:placements */
    SELECT DISTINCT placement.id FROM media_placements placement
    JOIN copyright_notice_targets target ON target.placement_id = placement.id
    WHERE target.copyright_notice_id = ${noticeId} ORDER BY placement.id
  `)
  await lockCopyrightPlacementTransitions(
    placements.map(placement => placement.id),
    query,
  )
  const { rows: created } = await query<{
    id: string
    copyright_notice_target_id: string
  }>(sql`/* imposeCopyrightCourtFilingRestrictions */
    INSERT INTO copyright_restrictions (
      copyright_notice_target_id, copyright_notice_submission_id, imposed_at
    ) SELECT target.id, ${submissionId}, ${now}
    FROM copyright_notice_targets target WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY target.id
    ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_target_id
  `)
  await runSequentially(
    created.map(
      restriction => () =>
        createCopyrightRestrictionDecisionNoticesInTransaction(
          {
            noticeId,
            targetId: restriction.copyright_notice_target_id,
            restrictionId: restriction.id,
            event: 'restricted',
          },
          query,
        ),
    ),
  )
  const previousRevision = new Map<string, number>()
  // Sorted actual writes share the other mutation writers' order, including retired bindings.
  await runSequentially(
    placements.map(placement => async () => {
      const { rows: withheld } = await query<{ prior_revision: number }>(sql`
      /* imposeCopyrightCourtFilingRestrictions:withhold */
      UPDATE media_placements placement
      SET copyright_withheld_at = ${now}, revision = placement.revision + 1
      WHERE placement.id = ${placement.id} AND placement.copyright_withheld_at IS NULL
      RETURNING WITH (OLD AS prior) prior.revision AS prior_revision
    `)
      if (withheld[0]) previousRevision.set(placement.id, withheld[0].prior_revision)
    }),
  )
  const { rows } = await query<{ id: string; placement_id: string; revision: number }>(sql`
    /* imposeCopyrightCourtFilingRestrictions:actions */
    SELECT restriction.id, placement.id AS placement_id, placement.revision
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN media_placements placement ON placement.id = target.placement_id
    WHERE target.copyright_notice_id = ${noticeId} AND restriction.lifted_at IS NULL
    ORDER BY restriction.id
  `)
  const intents = await insertCopyrightActionIntents(
    query,
    rows.map(row => ({
      restrictionId: row.id,
      placementRevision: previousRevision.get(row.placement_id) ?? row.revision,
      action: 'withhold' as const,
    })),
  )
  return intents.map(intent => intent.id)
}

/** Any assessment can release the shared filing ground once every current blocker clears. */
export async function insertCopyrightCourtFilingRestoreIntents(
  noticeId: string,
  query: TransactionQuery,
): Promise<string[]> {
  const { rows } = await query<{ id: string; revision: number }>(sql`
    /* insertCopyrightCourtFilingRestoreIntents */
    SELECT restriction.id, placement.revision
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN media_placements placement ON placement.id = target.placement_id
    WHERE target.copyright_notice_id = ${noticeId}
      AND restriction.copyright_notice_submission_id IS NOT NULL
      AND restriction.lifted_at IS NULL
    ORDER BY restriction.id
  `)
  const intents = await insertCopyrightActionIntents(
    query,
    rows.map(row => ({
      restrictionId: row.id,
      placementRevision: row.revision,
      action: 'restore' as const,
    })),
  )
  return intents.map(intent => intent.id)
}
