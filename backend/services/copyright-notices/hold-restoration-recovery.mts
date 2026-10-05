import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightNoticeHoldPlacements } from './hold-placement-locks.mts'
import { replayEligibleCopyrightRestoreIntentsInTransaction } from './court-hold-restore-replay.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/** Candidate selection is not authority: each case is rechecked under its complete placement fence. */
export function searchBlockedCopyrightHoldRestorationNoticeIds(
  options: CopyrightSweepPageOptions,
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright hold restoration cursor',
    'searchBlockedCopyrightHoldRestorationNoticeIds',
    'rowId',
    sql`
    /* searchBlockedCopyrightHoldRestorationNoticeIds */
    WITH candidates AS (
      SELECT DISTINCT target.copyright_notice_id AS id
      FROM copyright_notice_action_work_items intent
      JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE intent.action = 'restore' AND intent.state = 'blocked'
        AND EXISTS (
          SELECT 1 FROM copyright_notice_submissions submission
          JOIN copyright_notice_legal_hold_assessments assessment
            ON assessment.copyright_notice_submission_id = submission.id
          WHERE submission.copyright_notice_id = target.copyright_notice_id
            AND submission.kind = 'court_or_ccb_hold'
        )
    ) SELECT id FROM candidates WHERE TRUE
  `,
    statement => read(statement),
  )
}

/** Automatic legal-blocker recovery never resets provider-failed siblings or creates authority. */
export async function recoverBlockedCopyrightHoldRestorations(
  noticeId: string,
  now: Date,
): Promise<number> {
  await using transaction = await beginTransaction()
  await lockCopyrightNoticeHoldPlacements(noticeId, transaction)
  await transaction(sql`/* recoverBlockedCopyrightHoldRestorations:noticeLock */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const { rows } = await transaction<{ id: string }>(sql`
    /* recoverBlockedCopyrightHoldRestorations:originalIntents */
    SELECT intent.id FROM copyright_notice_action_work_items intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId} AND intent.action = 'restore'
      AND intent.state = 'blocked'
    ORDER BY intent.id
  `)
  const reopened = await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId,
    intentIds: rows.map(row => row.id),
    now,
    query: transaction,
  })
  await transaction.commit()
  return reopened.length
}
