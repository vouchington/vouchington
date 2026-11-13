import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { seedCopyrightGuestCapabilities } from './copyright-staff-case-states.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import type { createCopyrightReplayFixture } from './copyright-route-replay-setup.mts'

type Scene = Awaited<ReturnType<typeof createCopyrightReplayFixture>>
/** Terminal failed work is a committed prerequisite for the real operator replay request. */
export async function seedFailedTimelineAction(intentId: string) {
  await using transaction = await beginTransaction()
  // Canonical fixture history: each claim advances once and its failed result is recorded by the trigger.
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const { rowCount } =
      await transaction(sql`/* seedFailedTimelineAction:claimFact */ UPDATE copyright_notice_action_work_items
      SET attempt_count = attempt_count + 1, lease_token = uuidv7(), leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + INTERVAL '5 minutes', failure_message = NULL
      WHERE id = ${intentId} AND state = 'pending' AND attempt_count = ${ordinal - 1}`)
    if (rowCount !== 1) throw new Error('Owned timeline action attempt prerequisite changed')
    await transaction(sql`/* seedFailedTimelineAction:failedFact */ UPDATE copyright_notice_action_work_items
      SET leased_at = NULL, failure_message = 'provider outage',
        completed_at = ${ordinal === 5 ? new Date() : null},
        completed_at_reason = ${ordinal === 5 ? 'failed' : null}
      WHERE id = ${intentId} AND state = 'claimed'`)
  }
  await transaction.commit()
}

/** Complete committed private source/audit facts make every audience GET independent of writer SSI. */
export async function seedTimelineInternalFacts(scene: Scene) {
  const [capability] = await seedCopyrightGuestCapabilities({
    noticeId: scene.noticeId,
    issuedById: scene.moderator.id,
    expiresAt: new Date(Date.now() + 86_400_000),
    count: 1,
  })
  if (!capability) throw new Error('Owned timeline capability missing')
  await seedFailedTimelineAction(scene.intentId)
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedTimelineInternalFacts:replay */ UPDATE copyright_notice_action_work_items
    SET attempt_count = 0, leased_at = NULL, completed_at = NULL,completed_at_reason = NULL,
      available_at = clock_timestamp(),failure_message = 'Explicit operator replay after external delivery failure.'
    WHERE id = ${scene.intentId} AND state = 'failed'`)
  await transaction(sql`/* seedTimelineInternalFacts:replayAudit */ INSERT INTO copyright_notice_lifecycle_changes
    (copyright_notice_id,change_type,changed_by_id,copyright_notice_action_intent_id,replay_reason)
    VALUES (${scene.noticeId},'copyright_action_replayed',${scene.moderator.id},${scene.intentId},'operator_replay')`)
  for (const kind of ['supplement', 'court_or_ccb_hold'] as const) {
    const id = uuidv7()
    const now = new Date()
    const statement = `A ${kind} filing.`
    await transaction(sql`/* seedTimelineInternalFacts:filing */ INSERT INTO copyright_notice_submissions
      (id,copyright_notice_id,kind,received_at,source_kind,submitted_by_id,body_ciphertext,copyright_notice_guest_capability_id)
      VALUES (${id},${scene.noticeId},${kind},${now},'guest_form',NULL,
      ${encryptSecret(kind === 'court_or_ccb_hold' ? JSON.stringify({ summary: statement }) : statement, copyrightSubmissionPurpose(id))},${capability.id})`)
    await transaction(sql`/* seedTimelineInternalFacts:filingAudit */ INSERT INTO copyright_notice_lifecycle_changes
      (copyright_notice_id,change_type,copyright_notice_submission_id) VALUES (${scene.noticeId},${`${kind}_received`},${id})`)
    if (kind === 'court_or_ccb_hold')
      await transaction(
        sql`/* seedTimelineInternalFacts:urgent */ INSERT INTO copyright_notice_urgent_filings (copyright_notice_submission_id,classified_at) VALUES (${id},${now})`,
      )
  }
  await transaction(
    sql`/* seedTimelineInternalFacts:revoke */ UPDATE copyright_notice_guest_capabilities SET revoked_at = clock_timestamp() WHERE id = ${capability.id}`,
  )
  await transaction(sql`/* seedTimelineInternalFacts:revokeAudit */ INSERT INTO copyright_notice_lifecycle_changes
    (copyright_notice_id,change_type,changed_by_id,copyright_notice_guest_capability_id) VALUES (${scene.noticeId},'guest_capability_revoked',${scene.moderator.id},${capability.id})`)
  await transaction.commit()
}
