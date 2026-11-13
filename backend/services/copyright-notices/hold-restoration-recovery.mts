import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { replayEligibleCopyrightRestoreIntentsInTransaction } from './court-hold-restore-replay.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/** One keyset page of blocked restore intents. Candidate selection is not authority: each is rechecked under its notice's complete placement fence. */
export function searchBlockedCopyrightHoldRestorationIntentIds(
  options: CopyrightSweepPageOptions,
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright hold restoration cursor',
    'searchBlockedCopyrightHoldRestorationIntentIds',
    'rowId',
    sql`
    /* searchBlockedCopyrightHoldRestorationIntentIds */
    WITH candidates AS (
      SELECT intent.id
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
export async function recoverBlockedCopyrightHoldRestoration(
  intentId: string,
  now: Date,
): Promise<number> {
  await using transaction = await beginTransaction({ serializable: true })
  const { rows } = await transaction<{ notice_id: string }>(sql`
    /* recoverBlockedCopyrightHoldRestoration:notice */
    SELECT target.copyright_notice_id AS notice_id
    FROM copyright_notice_action_work_items intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE intent.id = ${intentId}
  `)
  const noticeId = rows[0]?.notice_id
  if (!noticeId) return 0
  await readCopyrightThreadRetirement(transaction, [noticeId])
  const reopened = await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId,
    intentIds: [intentId],
    now,
    query: transaction,
  })
  await transaction.commit()
  return reopened.length
}
