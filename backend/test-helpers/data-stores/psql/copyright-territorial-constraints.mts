import { randomBytes, randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { withRolledBackTerritorialTransaction } from './copyright-eu-uk-contracts.mts'

type Jurisdiction = 'eu_dsa' | 'uk'

type NoticeFixture = { approvalId: string; noticeId: string; userId: string }

async function insertNotice(
  transaction: TransactionQuery,
  jurisdiction: Jurisdiction,
): Promise<NoticeFixture> {
  const version = `${jurisdiction}-${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const { rows } = await transaction<{ approval_id: string; notice_id: string; user_id: string }>(
    sql`/* insertTerritorialNoticeFixture */
    WITH actor AS (
      INSERT INTO users DEFAULT VALUES RETURNING id
    ), approval AS (
      INSERT INTO copyright_jurisdiction_policy_approvals (
        jurisdiction, policy_version, approved_by_id
      )
      SELECT ${jurisdiction}, ${version}, id FROM actor
      RETURNING id
    ), notice AS (
      INSERT INTO copyright_notices (
        jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description,
        policy_version
      ) VALUES (${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
      RETURNING id
    )
    SELECT actor.id AS user_id, approval.id AS approval_id, notice.id AS notice_id
    FROM actor, approval, notice
  `,
  )
  const fixture = rows[0]
  if (!fixture) throw new Error('missing territorial notice fixture')
  return { approvalId: fixture.approval_id, noticeId: fixture.notice_id, userId: fixture.user_id }
}

async function insertNoticeSibling(
  transaction: TransactionQuery,
  jurisdiction: Jurisdiction,
): Promise<string> {
  const { rows } = await transaction<{ id: string }>(sql`/* insertTerritorialNoticeSibling */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description,
      policy_version
    ) VALUES (${jurisdiction}, 'copyright', CURRENT_TIMESTAMP, 'contact', 'work', 'test-v1')
    RETURNING id
  `)
  const notice = rows[0]
  if (!notice) throw new Error('missing sibling notice')
  return notice.id
}

async function insertReceipt(
  transaction: TransactionQuery,
  fixture: NoticeFixture,
  jurisdiction: Jurisdiction,
): Promise<string> {
  const { rows } = await transaction<{ id: string }>(sql`/* insertTerritorialReceipt */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, idempotency_key, request_sha256, hosted_use_url, grounds_ciphertext
    ) VALUES (
      ${fixture.noticeId}, ${jurisdiction}, ${fixture.approvalId}, ${fixture.userId},
      ${randomUUID()}, ${randomBytes(32)}, 'https://example.test/use', 'grounds'
    )
    RETURNING id
  `)
  const receipt = rows[0]
  if (!receipt) throw new Error('missing receipt fixture')
  return receipt.id
}

async function insertAcknowledgment(
  transaction: TransactionQuery,
  fixture: NoticeFixture,
  jurisdiction: Jurisdiction,
): Promise<string> {
  const receiptId = await insertReceipt(transaction, fixture, jurisdiction)
  const { rows } = await transaction<{ id: string }>(sql`/* insertTerritorialAcknowledgment */
    INSERT INTO copyright_territorial_notice_acknowledgments (
      copyright_territorial_notice_receipt_id
    ) VALUES (${receiptId})
    RETURNING id
  `)
  const acknowledgment = rows[0]
  if (!acknowledgment) throw new Error('missing acknowledgment fixture')
  return acknowledgment.id
}

async function insertDecision(
  transaction: TransactionQuery,
  noticeId: string,
  jurisdiction: Jurisdiction,
): Promise<string> {
  const { rows } = await transaction<{ id: string }>(sql`/* insertTerritorialDecision */
    INSERT INTO copyright_territorial_decisions (
      copyright_notice_id, jurisdiction, automation_disclosure, rationale_ciphertext
    ) VALUES (${noticeId}, ${jurisdiction}, 'human', 'rationale')
    RETURNING id
  `)
  const decision = rows[0]
  if (!decision) throw new Error('missing decision fixture')
  return decision.id
}

async function insertComplaint(transaction: TransactionQuery, noticeId: string): Promise<string> {
  const { rows } = await transaction<{ id: string }>(sql`/* insertEuSupervisedComplaint */
    INSERT INTO copyright_eu_supervised_complaints (
      copyright_notice_id, jurisdiction, authority_reference, explanation_ciphertext
    ) VALUES (${noticeId}, 'eu_dsa', 'authority-1', 'explanation')
    RETURNING id
  `)
  const complaint = rows[0]
  if (!complaint) throw new Error('missing complaint fixture')
  return complaint.id
}

/** A receipt cannot be recorded for a notice of another jurisdiction. */
export async function rejectEuReceiptForUkNotice(): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const eu = await insertNotice(transaction, 'eu_dsa')
    const uk = await insertNotice(transaction, 'uk')
    await insertReceipt(transaction, { ...eu, noticeId: uk.noticeId }, 'eu_dsa')
  })
}

/** A receipt cannot cite a policy approval of another jurisdiction. */
export async function rejectEuReceiptWithUkApproval(): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const eu = await insertNotice(transaction, 'eu_dsa')
    const uk = await insertNotice(transaction, 'uk')
    await insertReceipt(transaction, { ...eu, approvalId: uk.approvalId }, 'eu_dsa')
  })
}

/** An EU notice cannot carry a UK decision: the composite notice foreign key rejects it. */
export async function rejectUkDecisionForEuNotice(): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const eu = await insertNotice(transaction, 'eu_dsa')
    await insertDecision(transaction, eu.noticeId, 'uk')
  })
}

/** A UK notice cannot carry an EU-only supervised complaint. */
export async function rejectEuComplaintForUkNotice(): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const uk = await insertNotice(transaction, 'uk')
    await insertComplaint(transaction, uk.noticeId)
  })
}

/** A redress request for one notice cannot cite the decision recorded on another notice. */
export async function rejectRedressForAnotherNoticesDecision(): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const first = await insertNotice(transaction, 'eu_dsa')
    const second = await insertNoticeSibling(transaction, 'eu_dsa')
    const decisionId = await insertDecision(transaction, second, 'eu_dsa')
    await transaction(sql`/* rejectRedressForAnotherNoticesDecision */
      INSERT INTO copyright_territorial_redress_requests (
        copyright_notice_id, jurisdiction, copyright_territorial_decision_id, idempotency_key,
        explanation_ciphertext
      ) VALUES (${first.noticeId}, 'eu_dsa', ${decisionId}, ${randomUUID()}, 'explanation')
    `)
  })
}

/** An escalation names exactly one source: none and two are both rejected. */
export async function rejectEscalationWithSources(sources: 'none' | 'both'): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const eu = await insertNotice(transaction, 'eu_dsa')
    const acknowledgmentId =
      sources === 'both' ? await insertAcknowledgment(transaction, eu, 'eu_dsa') : null
    const complaintId = sources === 'both' ? await insertComplaint(transaction, eu.noticeId) : null
    await transaction(sql`/* rejectEscalationWithSources */
      INSERT INTO copyright_territorial_escalations (
        copyright_notice_id, jurisdiction, copyright_territorial_notice_acknowledgment_id,
        copyright_eu_supervised_complaint_id
      ) VALUES (${eu.noticeId}, 'eu_dsa', ${acknowledgmentId}, ${complaintId})
    `)
  })
}

/** An escalation cannot cite an acknowledgment recorded for a different notice. */
export async function rejectEscalationForAnotherNoticesAcknowledgment(): Promise<void> {
  await withRolledBackTerritorialTransaction(async transaction => {
    const first = await insertNotice(transaction, 'eu_dsa')
    const second = await insertNoticeSibling(transaction, 'eu_dsa')
    const acknowledgmentId = await insertAcknowledgment(transaction, first, 'eu_dsa')
    await transaction(sql`/* rejectEscalationForAnotherNoticesAcknowledgment */
      INSERT INTO copyright_territorial_escalations (
        copyright_notice_id, jurisdiction, copyright_territorial_notice_acknowledgment_id
      ) VALUES (${second}, 'eu_dsa', ${acknowledgmentId})
    `)
  })
}
