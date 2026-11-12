import { createRetentionMinimalCase } from './services/copyright-notices/retention-minimal-case.mts'
import { createRetentionParsedEmail } from './services/copyright-notices/retention-parsed-email.mts'
import { linkTestCopyrightEmailIntake } from './copyright-operational-email-retention.mts'
import { positionCopyrightOperationalCursor } from './copyright-operational-retention.mts'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** An owned later child page: references have drained, but its token binding or edges remain. */
export async function enterOwnedCopyrightThreadChildPhase(
  noticeId: string,
  intakeId: string,
  phase: 'references' | 'reply_edges' | 'ancestor_edges',
  drainReferences = true,
) {
  await using query = await beginTransaction()
  await query(sql`/* scopeOwnedCopyrightThreadChildFixture */
    SELECT set_config('app.copyright_retention_erasure', 'on', true),
      set_config('app.copyright_operational_retention', 'on', true)`)
  if (drainReferences)
    await query(sql`/* drainOwnedCopyrightThreadReferences */
    DELETE FROM copyright_notice_email_thread_references WHERE copyright_notice_email_intake_id = ${intakeId}`)
  await query(sql`/* enterOwnedCopyrightThreadChildPhase */
    UPDATE copyright_notice_operational_retention_cursors SET cursor_phase = ${phase},
      cursor_child_id = (SELECT previous.id FROM copyright_notice_email_intake_notice_links previous
        WHERE previous.copyright_notice_id = ${noticeId}
          AND previous.id < (SELECT id FROM copyright_notice_email_intake_notice_links
            WHERE copyright_notice_id = ${noticeId} AND copyright_notice_email_intake_id = ${intakeId})
        ORDER BY previous.id DESC LIMIT 1)
    WHERE kind = 'email_thread_references'`)
  await query.commit()
}

export async function readOwnedCopyrightThreadChildren(intakeId: string) {
  const { rows } = await read(sql`/* readOwnedCopyrightThreadChildren */ SELECT
    (SELECT matched_token_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${intakeId}) AS matched_token_id,
    (SELECT count(*)::integer FROM copyright_notice_email_message_ancestors
      WHERE reply_message_intake_receipt_id = ${intakeId}
        OR ancestor_message_intake_receipt_id = ${intakeId}) AS edges`)
  return rows[0]!
}

export async function readOwnedCopyrightCaseHoldHistory(noticeId: string) {
  const { rows } = await read(sql`/* readOwnedCopyrightCaseHoldHistory */
    SELECT id FROM copyright_case_preservation_holds WHERE copyright_notice_id = ${noticeId}`)
  return rows
}

export async function readRetiredCopyrightRequesterState(
  noticeId: string,
  intakeId: string,
  userId: string,
) {
  const { rows } = await read(sql`/* readRetiredCopyrightRequesterState */ SELECT
    (SELECT requester_user_id FROM copyright_notice_form_intakes WHERE id = ${intakeId}) AS requester_id,
    EXISTS(SELECT 1 FROM copyright_notices WHERE id = ${noticeId}) AS case_retained,
    EXISTS(SELECT 1 FROM retained_copyright_notice_identities WHERE id = ${noticeId}) AS identity_retained,
    EXISTS(SELECT 1 FROM copyright_notice_email_thread_retirements WHERE copyright_notice_id = ${noticeId}) AS retired,
    EXISTS(SELECT 1 FROM copyright_notice_party_identities WHERE copyright_notice_id = ${noticeId}
      AND account_user_id = ${userId}) AS party_retained`)
  return rows[0]!
}

/** One closed reply page and a distinct unresolved reply for real admission/retirement overlap. */
export async function createCopyrightThreadMarkerScene() {
  const notice = await createRetentionMinimalCase()
  const initial = await createRetentionParsedEmail('marker-initial', {
    sesMessageId: notice.initialEmailSesMessageId,
  })
  const reply = await createRetentionParsedEmail('marker-closed-reply', { reply: true })
  const candidate = await createRetentionParsedEmail('marker-candidate', { reply: true })
  await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
  await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
  await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
  await enterOwnedCopyrightThreadChildPhase(notice.noticeId, reply.id, 'references', false)
  return { notice, reply, candidate }
}
