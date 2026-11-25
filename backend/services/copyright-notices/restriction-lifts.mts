import { lockCopyrightActionGenerationForWrite } from './action-delivery-generation.mts'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import createError from 'http-errors'
import sql from 'sql-template-strings'
import { currentUserCanLiftCopyrightRestriction } from './authorization.mts'
import { createCopyrightClaimantDecisionNoticeInTransaction } from './claimant-decision-notices.mts'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
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
  await lockCopyrightActionGenerationForWrite(input.noticeId, transaction)
  const rationaleCiphertext = encryptSecret(
    input.rationale,
    `copyright-restriction-lift:${input.restrictionId}`,
  )
  const decision = sql`/* liftCopyrightRestrictionWithoutSetter:current */
    UPDATE copyright_restrictions restriction
    SET administrator_lift_decided_at = ${input.liftedAt},
      administrator_lift_decided_by_id = ${input.currentUser.id},
      administrator_lift_rationale_ciphertext = ${rationaleCiphertext}
    FROM copyright_notice_targets target
    WHERE restriction.id = ${input.restrictionId}
      AND restriction.lifted_at IS NULL AND restriction.administrator_lift_decided_at IS NULL
      AND target.id = restriction.copyright_notice_target_id
      AND target.copyright_notice_id = ${input.noticeId}
      AND NOT EXISTS (SELECT 1 FROM LATERAL `
    .append(copyrightPlacementPartiesSql('respond'))
    .append(sql` party)`)
  const { rowCount } = await transaction(decision)
  if (rowCount !== 1) {
    const { rows } = await transaction<{ already_lifted: boolean }>(sql`
      /* liftCopyrightRestrictionWithoutSetter:conflict */
      SELECT restriction.lifted_at IS NOT NULL
        OR restriction.administrator_lift_decided_at IS NOT NULL AS already_lifted
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE restriction.id = ${input.restrictionId} AND target.copyright_notice_id = ${input.noticeId}
    `)
    assert(rows[0], 404, 'Copyright restriction not found')
    assert(!rows[0].already_lifted, 409, 'Copyright restriction is already lifted')
    throw createError(409, 'A live account can respond to this restriction')
  }
  const { rows: lifts } = await transaction<{ id: string }>(sql`
    /* liftCopyrightRestrictionWithoutSetter:insert */
    INSERT INTO copyright_restriction_administrator_lifts (
      copyright_restriction_id, lifted_at, lifted_by_id, rationale_ciphertext
    ) VALUES (
      ${input.restrictionId}, ${input.liftedAt}, ${input.currentUser.id},
      ${rationaleCiphertext}
    ) RETURNING id
  `)
  const lift = lifts[0]
  assert(lift, 500, 'Copyright restriction lift was not recorded')
  // ast-grep-ignore: no-three-sequential-awaits -- record the restriction-lift event before restore intent and claimant notice writes; apply confirmation effects after those reversal obligations complete
  await transaction(sql`/* liftCopyrightRestrictionWithoutSetter:event */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id, copyright_restriction_id
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
