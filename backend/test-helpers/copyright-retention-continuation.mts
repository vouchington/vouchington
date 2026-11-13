import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createCopyrightNoticeSchemaFixture } from './data-stores/psql/copyright-notice-schema.mts'
import { createRetentionSignedInForm } from './services/copyright-notices/retention-signed-in-form.mts'
import {
  createCopyrightRetentionScopes,
  seedCopyrightExecutionAttemptPair,
  seedCopyrightFormScreeningAttemptPair,
} from './copyright-operational-retention.mts'

/** Two deletable pages, with eligible excluded action and form attempts inside the cursor windows. */
export async function createCopyrightRetentionContinuationFixture() {
  const notice = await createCopyrightNoticeSchemaFixture()
  const first = await seedCopyrightExecutionAttemptPair('action', notice.actionIntentId)
  const outside = await seedCopyrightExecutionAttemptPair('action', notice.actionIntentId)
  const second = await seedCopyrightExecutionAttemptPair('action', notice.actionIntentId)
  const intake = await createRetentionSignedInForm(notice.actorUserId)
  const form = await seedCopyrightFormScreeningAttemptPair(intake.id)
  const { rows } = await read<{ terminal_at: Date }>(sql`/* copyrightRetentionContinuationClock */
    SELECT GREATEST(
      (SELECT max(completed_at) FROM copyright_notice_action_attempt_results
        WHERE attempt_id = ANY(${[first.priorId, outside.priorId, second.priorId]}::uuid[])),
      (SELECT failed_at FROM copyright_notice_form_screening_attempts WHERE id = ${form.priorId})
    ) AS terminal_at
  `)
  return {
    scopes: createCopyrightRetentionScopes({
      copyrightActionAttempts: [first.priorId, second.priorId],
    }),
    firstId: first.priorId,
    secondId: second.priorId,
    outsideId: outside.priorId,
    latestId: second.latestId,
    formOutsideId: form.priorId,
    now: new Date(rows[0]!.terminal_at.getTime() + 181 * 24 * 60 * 60 * 1_000),
    async readOutsideState() {
      const { rows: snapshots } = await read(sql`/* copyrightRetentionContinuationOutsideState */
        SELECT to_jsonb(attempt) AS action_attempt, to_jsonb(result) AS action_result,
          (SELECT to_jsonb(form_attempt) FROM copyright_notice_form_screening_attempts form_attempt
            WHERE form_attempt.id = ${form.priorId}) AS form_attempt
        FROM copyright_notice_action_attempts attempt
        JOIN copyright_notice_action_attempt_results result ON result.attempt_id = attempt.id
        WHERE attempt.id = ${outside.priorId}
      `)
      return snapshots
    },
  }
}

/** An old superseded action attempt for proving an inactive family performs no cleanup. */
export async function createCopyrightInactiveRetentionFixture() {
  const notice = await createCopyrightNoticeSchemaFixture()
  const outside = await seedCopyrightExecutionAttemptPair('action', notice.actionIntentId)
  const { rows } = await read<{ completed_at: Date }>(sql`/* copyrightInactiveRetentionClock */
    SELECT completed_at FROM copyright_notice_action_attempt_results
    WHERE attempt_id = ${outside.latestId}
  `)
  return {
    outsideId: outside.priorId,
    now: new Date(rows[0]!.completed_at.getTime() + 181 * 24 * 60 * 60 * 1_000),
  }
}
