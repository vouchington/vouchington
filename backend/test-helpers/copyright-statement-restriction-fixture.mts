import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertCopyrightActionIntent } from '../services/copyright-notices/action-intent-insertion.mts'
import { createCopyrightRestrictionDecisionNoticesInTransaction } from '../services/copyright-notices/restriction-outcome-notices.mts'
import { applyCopyrightConfirmationConsequencesInTransaction } from '../services/copyright-notices/staydown-registration.mts'
import type { CopyrightRestrictionRecord } from '../services/copyright-notices/types.mts'

/** Complete committed imposition for projection/transport subjects, with canonical recipients. */
export async function seedCopyrightStatementRestriction(input: {
  noticeId: string
  targetId: string
  assessmentId: string
  revision: number
  moderatorId: string
  automated?: boolean
  reviewed?: boolean
  imposedAt?: Date
}) {
  const reviewed = input.reviewed ?? !input.automated
  const now = input.imposedAt ?? new Date()
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightStatementRestriction:notice */
    UPDATE copyright_notices SET accepted_at = COALESCE(accepted_at, ${now}),
      provisional_withholding_at = COALESCE(provisional_withholding_at, ${now}) WHERE id = ${input.noticeId}`)
  const { rows } =
    await transaction<CopyrightRestrictionRecord>(sql`/* seedCopyrightStatementRestriction */
    INSERT INTO copyright_restrictions (copyright_notice_target_id, authorizing_assessment_id,
      is_authorizing_assessment_automated, imposed_at, imposed_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id)
    VALUES (${input.targetId}, ${input.assessmentId}, ${input.automated ?? false}, ${now},
      ${reviewed ? input.moderatorId : null}, ${reviewed ? now : null}, ${reviewed ? 'confirm' : null},
      ${reviewed ? input.moderatorId : null})
    RETURNING id, copyright_notice_target_id, authorizing_assessment_id, imposed_at, lifted_at,
      imposed_by_id, lifted_by_id, human_reviewed_at, human_review_action, human_reviewed_by_id`)
  const restriction = rows[0]!
  await insertCopyrightActionIntent(transaction, restriction.id, input.revision, 'withhold')
  await createCopyrightRestrictionDecisionNoticesInTransaction(
    {
      noticeId: input.noticeId,
      targetId: input.targetId,
      restrictionId: restriction.id,
      event: 'restricted',
    },
    transaction,
  )
  if (reviewed)
    await applyCopyrightConfirmationConsequencesInTransaction(input.noticeId, transaction)
  await transaction(sql`/* seedCopyrightStatementRestriction:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id, copyright_restriction_id)
    VALUES (${input.noticeId}, 'provisional_restriction_imposed', ${reviewed ? input.moderatorId : null}, ${restriction.id})`)
  await transaction.commit()
  return restriction
}
