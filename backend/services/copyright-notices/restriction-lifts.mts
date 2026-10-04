import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import { getImagePlacementKey } from '@services/images/placements'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanLiftCopyrightRestriction } from './authorization.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from './claimant-decision-notices.mts'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from './staydown-registration.mts'

/** Administrator restoration when a restriction has no live subscriber who can respond. */
export async function liftCopyrightRestrictionWithoutSetter(input: {
  currentUser: PrivateUser
  noticeId: string
  restrictionId: string
  rationale: string
  liftedAt: Date
}): Promise<{ id: string }> {
  assert(currentUserCanLiftCopyrightRestriction(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: placementRows } = await transaction<{ placement_id: string }>(sql`
    /* liftCopyrightRestrictionWithoutSetter:findPlacement */
    SELECT target.placement_id FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE restriction.id = ${input.restrictionId} AND target.copyright_notice_id = ${input.noticeId}
  `)
  const placement = placementRows[0]
  assert(placement, 404, 'Copyright restriction not found')
  await transaction(sql`/* liftCopyrightRestrictionWithoutSetter:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${getImagePlacementKey(placement.placement_id)}, 0))
  `)
  const { rows: locked } = await transaction<{
    target_id: string
    lifted_at: Date | null
    lift_recorded: boolean
  }>(sql`
    /* liftCopyrightRestrictionWithoutSetter:lock */
    SELECT target.id AS target_id, restriction.lifted_at, EXISTS (
      SELECT 1 FROM copyright_restriction_administrator_lifts administrator_lift
      WHERE administrator_lift.copyright_restriction_id = restriction.id
    ) AS lift_recorded
    FROM copyright_notices notice
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    WHERE notice.id = ${input.noticeId} AND restriction.id = ${input.restrictionId}
    FOR UPDATE OF notice, target, restriction
  `)
  const restriction = locked[0]
  assert(restriction, 404, 'Copyright restriction not found')
  assert(
    restriction.lifted_at === null && !restriction.lift_recorded,
    409,
    'Copyright restriction is already lifted',
  )
  const respondersSql = sql`/* liftCopyrightRestrictionWithoutSetter:responders */
    SELECT EXISTS (SELECT 1 FROM copyright_notice_targets target
      CROSS JOIN LATERAL `
    .append(copyrightPlacementPartiesSql('respond'))
    .append(sql` party WHERE target.id = ${restriction.target_id}) AS has_responder`)
  const { rows: responders } = await transaction<{ has_responder: boolean }>(respondersSql)
  assert(!responders[0]?.has_responder, 409, 'A live account can respond to this restriction')
  const { rows: lifts } = await transaction<{ id: string }>(sql`
    /* liftCopyrightRestrictionWithoutSetter:insert */
    INSERT INTO copyright_restriction_administrator_lifts (
      copyright_restriction_id, lifted_at, lifted_by_id, rationale_ciphertext
    ) VALUES (
      ${input.restrictionId}, ${input.liftedAt}, ${input.currentUser.id},
      ${encryptSecret(input.rationale, `copyright-restriction-lift:${input.restrictionId}`)}
    ) RETURNING id
  `)
  const lift = lifts[0]
  assert(lift, 500, 'Copyright restriction lift was not recorded')
  // ast-grep-ignore: no-three-sequential-awaits -- the immutable event precedes the restore intent, claimant notice, and confirmation effects in one transaction.
  await transaction(sql`/* liftCopyrightRestrictionWithoutSetter:event */
    INSERT INTO copyright_notice_lifecycle_events (
      copyright_notice_id, event_type, actor_user_id, copyright_restriction_id
    ) VALUES (
      ${input.noticeId}, 'restriction_lifted_by_administrator', ${input.currentUser.id},
      ${input.restrictionId}
    )
  `)
  const intent = await createCopyrightRestoreIntentForReversalInTransaction(
    input.restrictionId,
    transaction,
  )
  await createCopyrightClaimantDecisionNoticeInTransaction(
    { noticeId: input.noticeId, event: 'reversed' },
    transaction,
  )
  await applyCopyrightConfirmationConsequencesInTransaction(input.noticeId, transaction)
  await transaction.commit()
  void enqueueApplyCopyrightAction(intent.id)
  return lift
}
