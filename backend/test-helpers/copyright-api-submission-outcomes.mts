import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createHash } from 'node:crypto'
/** Inspect every write in one poster submission transaction on the authoritative writer. */
export async function assertCopyrightSubmissionAdmission(
  response: { status: number; body: Record<string, unknown> },
  noticeId: string,
  kind: 'appeal' | 'counter_notice',
  key: string,
) {
  const digest = createHash('sha256').update(key.toLowerCase()).digest()
  const { rows } = await write<{
    submissions: number
    targets: number
    requests: number
    events: number
    deliveries: number
  }>(sql`/* assertCopyrightSubmissionAdmission */
    SELECT
      (SELECT count(*)::int FROM copyright_notice_submissions
       WHERE copyright_notice_id = ${noticeId} AND kind = ${kind}) AS submissions,
      (SELECT count(*)::int FROM copyright_notice_submission_targets target
       JOIN copyright_notice_submissions submission ON submission.id = target.copyright_notice_submission_id
       WHERE submission.copyright_notice_id = ${noticeId} AND submission.kind = ${kind}) AS targets,
      (SELECT count(*)::int FROM copyright_notice_submission_requests
       WHERE idempotency_key_sha256 = ${digest}) AS requests,
      (SELECT count(*)::int FROM copyright_notice_lifecycle_changes
       WHERE copyright_notice_id = ${noticeId} AND change_type = ${`${kind}_received`}) AS events,
      (SELECT count(*)::int FROM copyright_notice_delivery_work_items delivery
       JOIN copyright_notice_submissions submission ON submission.id = delivery.copyright_notice_submission_id
       WHERE submission.copyright_notice_id = ${noticeId} AND submission.kind = ${kind}) AS deliveries
  `)
  // SERIALIZABLE may reject this invocation even when the competing writer owns other rows.
  // The entire admission commits, or its submission, scope, receipt, event and delivery roll back.
  expect([
    {
      status: 201,
      code: undefined,
      message: undefined,
      duplicate: false,
      effects: { submissions: 1, targets: 1, requests: 1, events: 1, deliveries: 1 },
    },
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      duplicate: undefined,
      effects: { submissions: 0, targets: 0, requests: 0, events: 0, deliveries: 0 },
    },
  ]).toContainEqual({
    status: response.status,
    code: response.body['code'],
    message: response.body['message'],
    duplicate: response.body['is_duplicate'],
    effects: rows[0],
  })
}

export async function assertCopyrightApiManualAssociation(
  outcome: { status: number; body: Record<string, unknown> },
  intakeId: string,
  noticeId: string,
) {
  const { rows: links } = await write(sql`/* copyrightApiManualAssociation:links */
    SELECT copyright_notice_id, link_kind, correspondence_action
    FROM copyright_notice_email_intake_notice_links WHERE copyright_notice_email_intake_id = ${intakeId}`)
  const { rows: events } = await write(sql`/* copyrightApiManualAssociation:events */
    SELECT copyright_notice_id, change_type FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  expect([
    {
      status: 201,
      code: undefined,
      message: undefined,
      notice: { id: noticeId },
      intake: { id: intakeId },
      links: [
        { copyright_notice_id: noticeId, link_kind: 'thread', correspondence_action: 'pending' },
      ],
      events: [{ copyright_notice_id: noticeId, change_type: 'email_intake_manually_associated' }],
    },
    {
      status: 409,
      code: 'copyright_email_thread_changed',
      message: 'Copyright email thread changed; retry staff approval',
      notice: undefined,
      intake: undefined,
      links: [],
      events: [],
    },
  ]).toContainEqual({
    status: outcome.status,
    code: outcome.body['code'],
    message: outcome.body['message'],
    notice: outcome.body['copyright_notice'],
    intake: outcome.body['copyright_email_intake'],
    links,
    events,
  })
}
