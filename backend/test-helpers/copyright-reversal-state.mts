import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import { readCopyrightAssessmentRaceState } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readTestLiftSourceFlags } from './copyright-administrator-lift-fixtures.mts'

export async function readCommittedReversalState(
  noticeId: string,
  restrictionId: string,
  placementId: string,
) {
  const [state, aggregate, physical, flags, { rows: lifts }, { rows: registry }] =
    await Promise.all([
      readCopyrightAssessmentRaceState(noticeId),
      getCopyrightNoticePrivateAggregate(noticeId),
      getImagePlacementForCopyright(placementId),
      readTestLiftSourceFlags(restrictionId),
      write<{
        id: string
        restriction: string
        actor: string
      }>(sql`/* readCommittedReversalState:lifts */
      SELECT id, copyright_restriction_id AS restriction, lifted_by_id AS actor
      FROM copyright_restriction_administrator_lifts WHERE copyright_restriction_id = ${restrictionId}`),
      write<{
        revision: number
        desired: string
        state: string
      }>(sql`/* readCommittedReversalState:registry */
      SELECT record.placement_revision AS revision, record.desired_state AS desired, current.state
      FROM media_delivery_registry_records record
      JOIN view_media_delivery_registry_current_records current ON current.media_delivery_registry_record_id = record.id
      WHERE record.placement_id = ${placementId} ORDER BY record.placement_revision`),
    ])
  if (!aggregate || !physical) throw new Error('Owned reversal scene disappeared')
  return {
    state,
    physical: { withheld: physical.withheld, revision: physical.revision },
    flags,
    lifts,
    registry,
    attempts: aggregate.actionIntents.map(row => ({
      id: row.id,
      count: row.attempt_count,
      lease: row.lease_token !== null,
      reason: row.completed_at_reason,
    })),
  }
}
