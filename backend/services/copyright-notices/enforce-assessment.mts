import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isAutomaticProvisionalWithholdingEnabled } from './config.mts'
import { pendingCopyrightEnforcementSql } from './enforcement-pending-sql.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

type OwedTarget = { target_id: string; notice_id: string; imposed_by_id: string | null }
type ImposeRestriction = typeof acceptCopyrightNoticeAndImposeRestriction

/**
 * Restricts every target one current compliant notice assessment still owes. Each restriction
 * revalidates the assessment under the placement, form, notice and assessment locks, so a stale
 * authority never restricts. A failure leaves the remaining targets owed: the next call or sweep
 * pass recomputes them from the durable restrictions, so there is no claim to expire.
 */
export async function enforceCopyrightAssessment(
  assessmentId: string,
  dependencies: { imposeRestriction?: ImposeRestriction } = {},
): Promise<void> {
  await imposeOwedTargets(
    assessmentId,
    await isAutomaticProvisionalWithholdingEnabled(),
    dependencies.imposeRestriction ?? acceptCopyrightNoticeAndImposeRestriction,
  )
}

async function imposeOwedTargets(
  assessmentId: string,
  automaticWithholding: boolean,
  imposeRestriction: ImposeRestriction,
): Promise<void> {
  const target = await readFirstOwedTarget(assessmentId, automaticWithholding)
  if (!target) return
  try {
    await imposeRestriction({
      noticeId: target.notice_id,
      targetId: target.target_id,
      assessmentId,
      imposedAt: new Date(),
      imposedById: target.imposed_by_id,
    })
  } catch (error) {
    // A concurrent caller restricting the target, or a decision that superseded this assessment,
    // settles it without a failure. Anything else leaves the target owed, so it is retried.
    const stillOwed = await readFirstOwedTarget(assessmentId, automaticWithholding)
    if (stillOwed?.target_id === target.target_id) throw error
  }
  await imposeOwedTargets(assessmentId, automaticWithholding, imposeRestriction)
}

async function readFirstOwedTarget(
  assessmentId: string,
  automaticWithholding: boolean,
): Promise<OwedTarget | undefined> {
  const { rows } = await write<OwedTarget>(
    pendingCopyrightEnforcementSql(
      `target.id AS target_id, submission.copyright_notice_id AS notice_id,
      assessment.assessed_by_id AS imposed_by_id`,
      automaticWithholding,
    ).append(sql`\n      AND assessment.id = ${assessmentId}\n    ORDER BY target.id LIMIT 1`),
  )
  return rows[0]
}
