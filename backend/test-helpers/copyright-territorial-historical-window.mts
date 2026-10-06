import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { getTerritorialInformedWindow } from '../services/copyright-notices/territorial-informed-at.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from '../services/copyright-notices/correspondence.mts'

/** An old guest decision, created in chronological order without rewriting immutable evidence. */
export async function createTestHistoricalEuDecisionWindow(
  options: {
    initialState?: 'sent' | 'pending' | 'failed' | 'bounced'
    requesterUserId?: string
  } = {},
): Promise<{
  noticeId: string
  notifierEmail: string
  decidedAt: Date
  windowEndsAt: Date
}> {
  const now = new Date()
  const decidedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 8, 15, 12))
  const receivedAt = new Date(decidedAt.getTime() - 86_400_000)
  const sentAt = new Date(decidedAt.getTime() + 3_600_000)
  const windowEndsAt = new Date(
    Date.UTC(
      sentAt.getUTCFullYear(),
      sentAt.getUTCMonth() + 6,
      sentAt.getUTCDate(),
      sentAt.getUTCHours(),
      sentAt.getUTCMinutes(),
      sentAt.getUTCSeconds(),
    ),
  )
  const key = crypto.randomUUID()
  const notifierEmail = `historical-${key}@example.test`
  const labels = territorialLabels('eu_dsa')
  await using transaction = await beginTransaction()
  const { rows: approvals } = await transaction<{ id: string }>(sql`
    /* createTestHistoricalEuDecisionWindow:approval */
    INSERT INTO copyright_jurisdiction_policy_approvals (jurisdiction, policy_version, approved_at)
    VALUES ('eu_dsa', ${`eu-${key.slice(0, 12)}`}, ${receivedAt}) RETURNING id
  `)
  const approvalId = approvals[0]?.id
  if (!approvalId) throw new Error('Historical EU approval was not inserted')
  const { rows: notices } = await transaction<{ id: string }>(sql`
    /* createTestHistoricalEuDecisionWindow:notice */
    INSERT INTO copyright_notices (
      jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      'eu_dsa', 'copyright', ${receivedAt}, ${options.requesterUserId ?? null}, 'Historical notifier',
      ${encryptSecret(notifierEmail, `${labels.noticePurpose}:${key}:contact`)},
      'Photographic work', ${`eu-${key.slice(0, 12)}`}
    ) RETURNING id
  `)
  const noticeId = notices[0]?.id
  if (!noticeId) throw new Error('Historical EU notice was not inserted')
  await transaction(sql`/* createTestHistoricalEuDecisionWindow:receipt */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, requester_identity_sha256, idempotency_key, request_sha256, hosted_use_url,
      grounds_ciphertext, notifier_email_ciphertext, has_good_faith_statement, received_at
    ) VALUES (
      ${noticeId}, 'eu_dsa', ${approvalId}, ${options.requesterUserId ?? null}, ${randomBytes(32)}, ${key}, ${randomBytes(32)},
      'https://example.test/historical-use',
      ${encryptSecret('Grounds', `${labels.noticePurpose}:${key}:grounds`)},
      ${encryptSecret(notifierEmail, `${labels.noticePurpose}:${key}:notifier_email`)},
      TRUE, ${receivedAt}
    )
  `)
  await transaction(sql`/* createTestHistoricalEuDecisionWindow:decision */
    INSERT INTO copyright_territorial_decisions (
      copyright_notice_id, jurisdiction, decided_at, outcome, automation_disclosure,
      rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (
      ${noticeId}, 'eu_dsa', ${decidedAt}, 'no_action', 'human',
      ${encryptSecret('No action', `${labels.decisionPurpose}:${noticeId}`)},
      ${encryptSecret('No action was taken', `${labels.publicExplanationPurpose}:${noticeId}`)}
    )
  `)
  const state = options.initialState ?? 'sent'
  await insertTestTerritorialDecisionIntentInTransaction(transaction, {
    noticeId,
    role: 'claimant',
    userId: null,
    state,
    at: sentAt,
  })
  await transaction.commit()
  return { noticeId, notifierEmail, decidedAt, windowEndsAt }
}

type DecisionIntentState = 'sent' | 'pending' | 'failed' | 'bounced'

export async function insertTestTerritorialDecisionIntent(input: {
  noticeId: string
  role: 'claimant' | 'poster'
  userId: string | null
  state: DecisionIntentState
  at: Date
}): Promise<void> {
  await using transaction = await beginTransaction()
  await insertTestTerritorialDecisionIntentInTransaction(transaction, input)
  await transaction.commit()
}

async function insertTestTerritorialDecisionIntentInTransaction(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  input: {
    noticeId: string
    role: 'claimant' | 'poster'
    userId: string | null
    state: DecisionIntentState
    at: Date
  },
): Promise<void> {
  const state = input.state
  const sentAt = state === 'sent' || state === 'bounced' ? input.at : null
  const attemptedAt = state === 'pending' ? null : input.at
  const failedAt = state === 'failed' ? input.at : null
  const bouncedAt = state === 'bounced' ? new Date(input.at.getTime() + 1_000) : null
  const kind = input.role === 'claimant' ? 'claimant_decision_notice' : 'poster_restriction_notice'
  const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
    {
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: 'decision_notice',
      bodyText: 'Historical territorial decision notice.',
    },
    transaction,
  )
  await transaction(sql`/* insertTestTerritorialDecisionIntent */
    INSERT INTO copyright_notice_delivery_work_items (
      copyright_notice_id, copyright_notice_correspondence_message_id,
      recipient_user_id, recipient_role, delivery_kind, channel,
      attempt_count, idempotency_key, delivery_attempted_at, sent_at,
      failed_at, bounced_at
    ) VALUES (
      ${input.noticeId}, ${correspondence.id}, ${input.userId}, ${input.role}, ${kind}, 'email',
      ${state === 'pending' ? 0 : 1}, ${`historical-eu:${crypto.randomUUID()}`},
      ${attemptedAt}, ${sentAt}, ${failedAt}, ${bouncedAt}
    )
  `)
}

export async function readTestTerritorialInformedWindow(input: {
  noticeId: string
  decidedAt: Date
  posterUserId?: string
  notifier: boolean
}) {
  await using transaction = await beginTransaction()
  const window = await getTerritorialInformedWindow(input, transaction)
  await transaction.commit()
  return window
}

export async function insertTestHistoricalTerritorialComplaint(input: {
  noticeId: string
  requesterUserId: string
  idempotencyKey: string
  receivedAt: Date
}): Promise<string> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(sql`
    /* insertTestHistoricalTerritorialComplaint */
    INSERT INTO copyright_territorial_redress_requests (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id,
      submitted_by_id, filed_by, idempotency_key, explanation_ciphertext, received_at
    ) SELECT ${input.noticeId}, 'eu_dsa', decision.id, ${input.requesterUserId}, 'notifier',
      ${input.idempotencyKey},
      ${encryptSecret('Earlier complaint', `${territorialLabels('eu_dsa').redressPurpose}:${input.idempotencyKey}`)},
      ${input.receivedAt}
    FROM copyright_territorial_decisions decision
    WHERE decision.copyright_notice_id = ${input.noticeId} AND decision.jurisdiction = 'eu_dsa'
    RETURNING id
  `)
  const id = rows[0]?.id
  if (!id) throw new Error('Historical complaint was not inserted')
  await transaction.commit()
  return id
}
