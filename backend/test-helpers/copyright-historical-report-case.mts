import { v7 as uuidv7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './entities/users.mts'
import {
  attachCopyrightEncryptionKey,
  openCopyrightSecrets,
  prepareCopyrightEncryptionKey,
} from '../services/copyright-notices/encryption-keys.mts'
import { recordCopyrightJurisdictionPolicyApproval } from '../services/copyright-notices/jurisdiction-policy.mts'
import { createCopyrightReplayDigest } from '../services/copyright-notices/replay-identity-hmac.mts'
import { territorialRequestSha256 } from '../services/copyright-notices/territorial-fields.mts'

const EVENT_AT = new Date('2500-01-15T00:00:00.000Z')

/** FK-valid DSA report facts at a fixed historical instant for cumulative retention coverage. */
export async function createHistoricalCopyrightEuReportCase() {
  const [administrator, staff] = await Promise.all([
    createTestUser({ administrator: true }),
    createTestUser({ extraRoles: ['moderator'] }),
  ])
  const suffix = crypto.randomUUID()
  const policy = await recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction: 'eu_dsa',
    policyVersion: `eu-historical-${suffix.replaceAll('-', '').slice(0, 16)}`,
  })
  const noticeId = uuidv7({ msecs: EVENT_AT.getTime() })
  const receiptId = uuidv7({ msecs: EVENT_AT.getTime() })
  const decisionId = uuidv7({ msecs: EVENT_AT.getTime() })
  const redressRequestId = uuidv7({ msecs: EVENT_AT.getTime() })
  const redressDecisionId = uuidv7({ msecs: EVENT_AT.getTime() })
  const complaintId = uuidv7({ msecs: EVENT_AT.getTime() })
  const escalationId = uuidv7({ msecs: EVENT_AT.getTime() })
  const idempotencyKey = crypto.randomUUID()
  const noticePurpose = `copyright-eu-notice:${idempotencyKey}`
  const requesterIdentity = `historical-fixture:${suffix}`
  const request = {
    contact: `private-contact-${suffix}`,
    contentDescription: `private-work-${suffix}`,
    grounds: `private-grounds-${suffix}`,
    hostedUseUrl: `https://example.test/private-work/${suffix}`,
    notifierName: `private-notifier-${suffix}`,
    notifierEmail: `private-notifier-${suffix}@example.test`,
    goodFaithStatement: true as const,
  }
  const privateValues = [
    requesterIdentity,
    request.contact,
    request.contentDescription,
    request.grounds,
    request.hostedUseUrl,
    request.notifierName,
    request.notifierEmail,
    `private-redress-${suffix}`,
    `private-complaint-${suffix}`,
    `private-decision-${suffix}`,
    `private-public-explanation-${suffix}`,
    `private-redress-decision-${suffix}`,
    `private-submission-${suffix}`,
    `DSC-${suffix}`,
  ]
  await using preparedKey = await prepareCopyrightEncryptionKey('notice')
  await using transaction = await beginTransaction()
  const owner = { kind: 'notice' as const, id: noticeId }
  await attachCopyrightEncryptionKey(preparedKey, owner, transaction)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:notice */
    INSERT INTO copyright_notices (
      id, jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      ${noticeId}, 'eu_dsa', 'copyright', ${EVENT_AT}, NULL, NULL,
      ${preparedKey.encrypt(request.contact, `${noticePurpose}:contact`, owner)},
      ${request.contentDescription}, ${policy.policy_version}
    )`)
  await using secrets = await openCopyrightSecrets(owner, transaction, 'write')
  const { encryptSecret } = secrets
  const requesterDigest = createCopyrightReplayDigest('requester', requesterIdentity).digest
  const requestDigest = territorialRequestSha256(request)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:submission */
    INSERT INTO copyright_notice_submissions (
      copyright_notice_id, submitted_by_id, kind, received_at, source_kind, body_ciphertext
    ) VALUES (
      ${noticeId}, ${staff.id}, 'notice', ${EVENT_AT}, 'staff',
      ${encryptSecret(`private-submission-${suffix}`, `historical-staff-submission:${noticeId}`)}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:lifecycle */
    INSERT INTO copyright_notice_lifecycle_changes (id, copyright_notice_id, change_type)
    VALUES (${uuidv7({ msecs: EVENT_AT.getTime() })}, ${noticeId}, 'notice_received')`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:receipt */
    INSERT INTO copyright_territorial_notice_receipts (
      id, copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, requester_identity_hmac, idempotency_key, request_sha256,
      hosted_use_url, grounds_ciphertext, notifier_email_ciphertext, has_good_faith_statement,
      received_at
    ) VALUES (
      ${receiptId}, ${noticeId}, 'eu_dsa', ${policy.id}, NULL, ${requesterDigest},
      ${idempotencyKey}, ${requestDigest}, ${request.hostedUseUrl},
      ${encryptSecret(request.grounds, `${noticePurpose}:grounds`)},
      ${encryptSecret(request.notifierEmail, `${noticePurpose}:notifier_email`)}, TRUE, ${EVENT_AT}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:routing */
    INSERT INTO copyright_territorial_notice_routings (
      copyright_territorial_notice_receipt_id, destination, routed_at, created_at
    ) VALUES (${receiptId}, 'staff_queue', ${EVENT_AT}, ${EVENT_AT})`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:acknowledgment */
    INSERT INTO copyright_territorial_notice_acknowledgments (
      id, copyright_territorial_notice_receipt_id, attempt_count, last_attempt_at, acknowledged_at
    ) VALUES (
      ${uuidv7({ msecs: EVENT_AT.getTime() })}, ${receiptId}, 1, ${EVENT_AT}, ${EVENT_AT}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:decision */
    INSERT INTO copyright_territorial_decisions (
      id, copyright_notice_id, jurisdiction, decided_at, decided_by_id, outcome,
      automation_disclosure, rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (
      ${decisionId}, ${noticeId}, 'eu_dsa', ${EVENT_AT}, ${staff.id}, 'no_action', 'human',
      ${encryptSecret(`private-decision-${suffix}`, `copyright-eu-statement:${noticeId}`)},
      ${encryptSecret(
        `private-public-explanation-${suffix}`,
        `copyright-eu-public-explanation:${noticeId}`,
      )}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:redress-request */
    INSERT INTO copyright_territorial_redress_requests (
      id, copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      submitted_by_id, filed_by, idempotency_key, explanation_ciphertext, received_at
    ) VALUES (
      ${redressRequestId}, ${noticeId}, 'eu_dsa', ${decisionId}, NULL, 'notifier',
      ${crypto.randomUUID()},
      ${encryptSecret(`private-redress-${suffix}`, `copyright-eu-redress:${idempotencyKey}`)},
      ${EVENT_AT}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:redress-decision */
    INSERT INTO copyright_territorial_redress_decisions (
      id, copyright_territorial_redress_request_id, decided_at, decided_by_id,
      staff_disposition, rationale_ciphertext
    ) VALUES (
      ${redressDecisionId}, ${redressRequestId}, ${EVENT_AT}, ${staff.id}, 'maintain',
      ${encryptSecret(
        `private-redress-decision-${suffix}`,
        `copyright-eu-redress-decision:${redressRequestId}`,
      )}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:complaint */
    INSERT INTO copyright_eu_supervised_complaints (
      id, copyright_notice_id, jurisdiction, recorded_by_id, idempotency_key,
      authority_reference, explanation_ciphertext, received_at
    ) VALUES (
      ${complaintId}, ${noticeId}, 'eu_dsa', ${staff.id}, ${crypto.randomUUID()},
      ${`DSC-${suffix}`},
      ${encryptSecret(
        `private-complaint-${suffix}`,
        `copyright-eu-supervised:${noticeId}:DSC-${suffix}`,
      )},
      ${EVENT_AT}
    )`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:escalation */
    INSERT INTO copyright_territorial_escalations (
      id, copyright_notice_id, jurisdiction, copyright_eu_supervised_complaint_id, escalated_at
    ) VALUES (${escalationId}, ${noticeId}, 'eu_dsa', ${complaintId}, ${EVENT_AT})`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:complaint-resolution */
    INSERT INTO copyright_eu_supervised_complaint_resolutions (
      copyright_eu_supervised_complaint_id, resolved_by_id, resolved_at
    ) VALUES (${complaintId}, ${staff.id}, ${EVENT_AT})`)
  await transaction(sql`/* createHistoricalCopyrightEuReportCase:escalation-closure */
    INSERT INTO copyright_territorial_escalation_closures (
      copyright_territorial_escalation_id, closed_by_id, closed_at
    ) VALUES (${escalationId}, ${staff.id}, ${EVENT_AT})`)
  await secrets[Symbol.asyncDispose]()
  await transaction.commit()
  return { noticeId, privateValues, staff, eventAt: new Date(EVENT_AT) }
}
