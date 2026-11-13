import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser } from './index.mts'
import { openTestGuestCopyrightNotice } from './services/copyright-notices/guest-capability.mts'
import { seedCopyrightGuestCapabilities } from './copyright-staff-case-states.mts'
import { copyrightSubmissionPurpose } from '../services/copyright-notices/submissions.mts'
import { recordClaimantMisuseEvent } from '../services/copyright-notices/claimant-misuse-ledger.mts'
import { revokeCopyrightGuestCapabilitiesForWithdrawal } from '../services/copyright-notices/guest-capability-withdrawal.mts'

/** Each scene owns live, staff-revoked and unrelated-case capabilities with full issue/revoke audits. */
export async function createWithdrawalCapabilityScene() {
  const [noticeId, otherNoticeId, staff] = await Promise.all([
    openTestGuestCopyrightNotice(),
    openTestGuestCopyrightNotice(),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const expiresAt = new Date(Date.now() + 7 * 86_400_000)
  const [[filer, sibling, alreadyRevoked], [otherCase]] = await Promise.all([
    seedCopyrightGuestCapabilities({ noticeId, issuedById: staff.id, expiresAt, count: 3 }),
    seedCopyrightGuestCapabilities({
      noticeId: otherNoticeId,
      issuedById: staff.id,
      expiresAt,
      count: 1,
    }),
  ])
  if (!filer || !sibling || !alreadyRevoked || !otherCase)
    throw new Error('Owned withdrawal capabilities missing')
  const staffRevokedAt = new Date(Date.now() - 60_000)
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* createWithdrawalCapabilityScene:staffRevoke */ UPDATE copyright_notice_guest_capabilities SET revoked_at = ${staffRevokedAt} WHERE id = ${alreadyRevoked.id}`,
  )
  await transaction(sql`/* createWithdrawalCapabilityScene:staffAudit */ INSERT INTO copyright_notice_lifecycle_changes
    (copyright_notice_id,change_type,changed_by_id,copyright_notice_guest_capability_id) VALUES (${noticeId},'guest_capability_revoked',${staff.id},${alreadyRevoked.id})`)
  await transaction.commit()
  return {
    noticeId,
    otherNoticeId,
    staff,
    filer,
    sibling,
    alreadyRevoked,
    otherCase,
    staffRevokedAt,
  }
}
export type WithdrawalCapabilityScene = Awaited<ReturnType<typeof createWithdrawalCapabilityScene>>

/** A separate complete committed withdrawal precedes unconditional invalid-token guards. */
export async function seedCommittedGuestWithdrawal(scene: WithdrawalCapabilityScene) {
  const now = new Date()
  const id = uuidv7()
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCommittedGuestWithdrawal:submission */ INSERT INTO copyright_notice_submissions
    (id,copyright_notice_id,kind,received_at,source_kind,submitted_by_id,body_ciphertext,copyright_notice_guest_capability_id)
    VALUES (${id},${scene.noticeId},'withdrawal',${now},'guest_form',NULL,${encryptSecret('The claimant withdraws the notice.', copyrightSubmissionPurpose(id))},${scene.filer.id})`)
  await transaction(sql`/* seedCommittedGuestWithdrawal:event */ INSERT INTO copyright_notice_lifecycle_changes
    (copyright_notice_id,change_type,copyright_notice_submission_id) VALUES (${scene.noticeId},'withdrawal_received',${id})`)
  await recordClaimantMisuseEvent(transaction, {
    noticeId: scene.noticeId,
    event: { outcome: 'notice_withdrawn', submissionId: id },
    recordedAt: now,
  })
  await revokeCopyrightGuestCapabilitiesForWithdrawal(transaction, {
    noticeId: scene.noticeId,
    revokedAt: now,
  })
  await transaction.commit()
  return now
}
