import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { throwIfCopyrightEmailThreadWriteConflict } from './email-thread-write-conflict.mts'

/** Maintain the case clock once, after an actual new thread link was inserted. */
export async function maintainCopyrightEmailThreadLinkActivity(
  transaction: TransactionQuery,
  input: {
    noticeId: string
    intakeId: string
    authorizingAncestorIntakeIds?: readonly string[]
  },
): Promise<void> {
  return maintainCopyrightEmailThreadLinkActivities(transaction, {
    noticeId: input.noticeId,
    intakeIds: [input.intakeId],
    authorizingAncestorIntakeIds: input.authorizingAncestorIntakeIds,
  })
}

/** Maintain one case clock from the actual new links and their bounded authorizing sources. */
export async function maintainCopyrightEmailThreadLinkActivities(
  transaction: TransactionQuery,
  input: {
    noticeId: string
    intakeIds: readonly string[]
    authorizingAncestorIntakeIds?: readonly string[]
  },
): Promise<void> {
  if (input.intakeIds.length === 0) return
  const oldestSourceId = [
    ...input.intakeIds,
    ...(input.authorizingAncestorIntakeIds ?? []),
  ].toSorted()[0]!
  try {
    await transaction(sql`/* maintainCopyrightEmailThreadLinkActivity */
      SELECT fn_copyright_touch_thread_retention_activity(
        ${input.noticeId}::uuid,
        max(GREATEST(
          uuid_extract_timestamp(link.id), intake.received_at,
          (SELECT reference.created_at FROM copyright_notice_email_thread_references reference
            WHERE reference.copyright_notice_email_intake_id = intake.id
            ORDER BY reference.id DESC LIMIT 1),
          (SELECT review.reviewed_at FROM copyright_notice_email_intake_reviews review
            WHERE review.copyright_notice_email_intake_receipt_id = intake.id
            ORDER BY review.id DESC LIMIT 1),
          CURRENT_TIMESTAMP
        )), ${oldestSourceId}::uuid)
      FROM unnest(${[...input.intakeIds]}::uuid[]) inserted(intake_id)
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = inserted.intake_id
        AND link.copyright_notice_id = ${input.noticeId}
      JOIN copyright_notice_email_intakes intake ON intake.id = inserted.intake_id
      HAVING count(*) > 0`)
  } catch (err) {
    throwIfCopyrightEmailThreadWriteConflict(err)
    throw err
  }
}
