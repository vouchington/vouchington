import { shiftUtcCalendarMonths } from '../modules/utils/calendar-months.mts'
import { getCopyrightRetentionWindows } from '../services/copyright-notices/config.mts'
import { randomBytes } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import {
  prepareCopyrightEncryptionKey,
  attachCopyrightEncryptionKey,
  openCopyrightSecrets,
} from '../services/copyright-notices/encryption-keys.mts'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { lockCopyrightJurisdictionPolicy } from './copyright-jurisdiction-policy-lock.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'
import { getTerritorialInformedWindow } from '../services/copyright-notices/territorial-informed-at.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from '../services/copyright-notices/correspondence.mts'

export async function createTestHistoricalEuDecisionWindow(
  options: {
    decidedAt?: Date
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
  const decidedAt = options.decidedAt
    ? new Date(options.decidedAt.getTime())
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 8, 15, 12))
  const receivedAt = new Date(decidedAt.getTime() - 86_400_000)
  const sentAt = new Date(decidedAt.getTime() + 3_600_000)
  const windowEndsAt = shiftUtcCalendarMonths(
    sentAt,
    getCopyrightRetentionWindows().complaintMonths,
  )
  const key = crypto.randomUUID()
  const notifierEmail = `historical-${key}@example.test`
  const labels = territorialLabels('eu_dsa')
  const noticeId = uuidv7({ msecs: receivedAt.getTime() })
  const owner = { kind: 'notice' as const, id: noticeId }
  await using prepared = await prepareCopyrightEncryptionKey('notice')
  await using transaction = await beginTransaction()
  await attachCopyrightEncryptionKey(prepared, owner, transaction)
  await lockCopyrightJurisdictionPolicy('eu_dsa', transaction)
  const { rows: actors } = await transaction<{ id: string }>(sql`
    /* createTestHistoricalEuDecisionWindow:actor */
    INSERT INTO users DEFAULT VALUES RETURNING id`)
  const actorId = actors[0]!.id
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
      id, jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version
    ) VALUES (
      ${noticeId}, 'eu_dsa', 'copyright', ${receivedAt}, ${options.requesterUserId ?? null}, 'Historical notifier',
      ${prepared.encrypt(notifierEmail, `${labels.noticePurpose}:${key}:contact`, owner)},
      'Photographic work', ${`eu-${key.slice(0, 12)}`}
    ) RETURNING id
  `)
  if (!notices[0]?.id) throw new Error('Historical EU notice was not inserted')
  await using secrets = await openCopyrightSecrets(owner, transaction, 'write')
  const { encryptSecret } = secrets
  await transaction(sql`/* createTestHistoricalEuDecisionWindow:receipt */
    INSERT INTO copyright_territorial_notice_receipts (
      copyright_notice_id, jurisdiction, copyright_jurisdiction_policy_approval_id,
      requester_user_id, requester_identity_hmac, idempotency_key, request_sha256, hosted_use_url,
      grounds_ciphertext, notifier_email_ciphertext, has_good_faith_statement, received_at
    ) VALUES (
      ${noticeId}, 'eu_dsa', ${approvalId}, ${options.requesterUserId ?? null}, ${randomBytes(32)}, ${key}, ${randomBytes(32)},
      'https://example.test/historical-use',
      ${encryptSecret('Grounds', `${labels.noticePurpose}:${key}:grounds`)},
      ${encryptSecret(notifierEmail, `${labels.noticePurpose}:${key}:notifier_email`)},
      TRUE, ${receivedAt}
    )
  `)
  const decisionId = uuidv7()
  const rationaleCiphertext = encryptSecret('No action', `${labels.decisionPurpose}:${noticeId}`)
  const publicExplanationCiphertext = encryptSecret(
    'No action was taken',
    `${labels.publicExplanationPurpose}:${noticeId}`,
  )
  await transaction(sql`/* createTestHistoricalEuDecisionWindow:decisionIdentity */
    INSERT INTO copyright_territorial_decision_identities
      (id, copyright_notice_id, jurisdiction)
    VALUES (${decisionId}, ${noticeId}, 'eu_dsa')`)
  await transaction(sql`/* createTestHistoricalEuDecisionWindow:decision */
    INSERT INTO copyright_territorial_decisions (
      id, copyright_notice_id, jurisdiction, decided_at, decided_by_id, outcome, automation_disclosure,
      rationale_ciphertext, public_explanation_ciphertext
    ) VALUES (
      ${decisionId}, ${noticeId}, 'eu_dsa', ${decidedAt}, ${actorId}, 'no_action', 'human',
      ${rationaleCiphertext}, ${publicExplanationCiphertext}
    )
  `)
  await transaction(sql`/* createTestHistoricalEuDecisionWindow:currentDecision */
    UPDATE copyright_notices SET
      current_territorial_decision_identity_id = ${decisionId},
      territorial_decision_outcome = 'no_action', territorial_decided_at = ${decidedAt},
      territorial_decided_by_id = ${actorId},
      territorial_rationale_ciphertext = ${rationaleCiphertext},
      territorial_public_explanation_ciphertext = ${publicExplanationCiphertext}
    WHERE id = ${noticeId}`)
  await insertTestTerritorialDecisionIntentInTransaction(transaction, {
    noticeId,
    role: 'claimant',
    userId: null,
    state: options.initialState ?? 'sent',
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
