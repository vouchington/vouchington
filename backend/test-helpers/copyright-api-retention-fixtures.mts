import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { createTestUser } from './index.mts'
import {
  approveJurisdictionPolicy,
  seedPendingTerritorialNotice,
} from './services/copyright-notices/territorial-routes.mts'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from '../services/copyright-notices/last-legal-activity.mts'

/** A complete committed complaint/escalation dependency for the retention HTTP actions. */
export async function createCopyrightApiRetentionCase() {
  const [claimant, reviewer, administrator] = await Promise.all([
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  await approveJurisdictionPolicy(administrator, 'eu_dsa')
  const noticeId = await seedPendingTerritorialNotice('eu_dsa', claimant)
  const authority = `authority-${crypto.randomUUID()}`
  await using transaction = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
  if (!notice) throw new Error('Owned retention notice disappeared')
  const { rows: complaints } = await transaction<{
    id: string
  }>(sql`/* createCopyrightApiRetentionCase:complaint */
    INSERT INTO copyright_eu_supervised_complaints
      (copyright_notice_id, jurisdiction, recorded_by_id, idempotency_key, authority_reference, explanation_ciphertext)
    VALUES (${noticeId}, 'eu_dsa', ${claimant.id}, ${crypto.randomUUID()}, ${authority},
      ${encryptSecret(`Complaint ${crypto.randomUUID()}`, `copyright-eu-supervised:${noticeId}:${authority}`)}) RETURNING id`)
  const complaintId = complaints[0]!.id
  const { rows: escalations } = await transaction<{
    id: string
  }>(sql`/* createCopyrightApiRetentionCase:escalation */
    INSERT INTO copyright_territorial_escalations
      (copyright_notice_id, jurisdiction, copyright_eu_supervised_complaint_id)
    VALUES (${noticeId}, 'eu_dsa', ${complaintId}) RETURNING id`)
  await advanceCopyrightLastLegalActivityAt(transaction, notice)
  await transaction.commit()
  return { noticeId, complaintId, escalationId: escalations[0]!.id, claimant, reviewer }
}

/** A release/replay subject must run even if an independent placement request loses SSI. */
export async function seedCopyrightApiPreservationHold(
  noticeId: string,
  actorId: string,
  kind: 'litigation_threat' | 'regulator_request' | 'court_request',
) {
  await using transaction = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
  if (!notice) throw new Error('Owned preservation notice disappeared')
  const { rows } = await transaction<{ id: string }>(sql`/* seedCopyrightApiPreservationHold */
    INSERT INTO copyright_case_preservation_holds (copyright_notice_id, kind, placed_by_id)
    VALUES (${noticeId}, ${kind}::copyright_case_preservation_kinds, ${actorId}) RETURNING id`)
  await advanceCopyrightLastLegalActivityAt(transaction, notice)
  await transaction.commit()
  return rows[0]!.id
}
