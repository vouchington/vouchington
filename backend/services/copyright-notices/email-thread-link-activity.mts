import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForParentHistory } from '@modules/utils'
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
  const reviewLowerBound = getMinUUIDv7ForParentHistory([...input.intakeIds].toSorted()[0]!)
  try {
    await transaction(sql`/* maintainCopyrightEmailThreadLinkActivity */
      WITH link_clock AS (
        SELECT max(GREATEST(
          uuid_extract_timestamp(link.id), intake.received_at,
          (SELECT reference.created_at FROM copyright_notice_email_thread_references reference
            WHERE reference.copyright_notice_email_intake_id = intake.id
            ORDER BY reference.id DESC LIMIT 1),
          (SELECT review.reviewed_at FROM copyright_notice_email_intake_reviews review
            WHERE review.copyright_notice_email_intake_receipt_id = intake.id
              AND review.id >= ${reviewLowerBound}::uuid
            ORDER BY review.id DESC LIMIT 1),
          CURRENT_TIMESTAMP
        )) AS last_activity_at
        FROM unnest(${[...input.intakeIds]}::uuid[]) inserted(intake_id)
        JOIN copyright_notice_email_intake_notice_links link
          ON link.copyright_notice_email_intake_id = inserted.intake_id
          AND link.copyright_notice_id = ${input.noticeId}
        JOIN copyright_notice_email_intakes intake ON intake.id = inserted.intake_id
      )
      SELECT fn_copyright_touch_thread_retention_activity(
        ${input.noticeId}::uuid, link_clock.last_activity_at, ${oldestSourceId}::uuid)
      FROM link_clock
      WHERE link_clock.last_activity_at IS NOT NULL`)
  } catch (err) {
    throwIfCopyrightEmailThreadWriteConflict(err)
    throw err
  }
}
