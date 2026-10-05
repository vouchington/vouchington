import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { assertBoundedText } from './territorial-fields.mts'
import { territorialDecisionIsLiveSql } from './territorial-redress-sql.mts'

export type EuDisputeSettlementResult =
  | 'decided_for_recipient'
  | 'decided_for_platform'
  | 'withdrawn'
  | 'no_decision'
export type EuDisputeSettlementReferral = { id: string; copyright_territorial_decision_id: string }
export type EuDisputeSettlementOutcome = {
  id: string
  result: EuDisputeSettlementResult
  implemented_at: Date | null
}

/** A staff record of a party's referral; the body does not bind Voucha's decision. */
export async function recordEuDisputeSettlementReferral(
  currentUser: PrivateUser,
  noticeId: string,
  input: {
    bodyName: string
    referredAt: Date
    referredByParty: 'poster' | 'notifier'
    referredByUserId: string | null
  },
): Promise<EuDisputeSettlementReferral> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  const bodyName = assertBoundedText(input.bodyName, 200, 'body_name is required')
  assertValidDate(input.referredAt, 'referred_at')
  assert(
    input.referredByParty === 'poster' || input.referredByParty === 'notifier',
    422,
    'referred_by_party is required',
  )
  await using transaction = await beginTransaction()
  const parentQuery = sql`/* recordEuDisputeSettlementReferral:decision */
    SELECT decision.id, receipt.requester_user_id
    FROM copyright_territorial_decisions decision
    JOIN copyright_territorial_notice_receipts receipt
      ON receipt.copyright_notice_id = decision.copyright_notice_id
      AND receipt.jurisdiction = decision.jurisdiction
    WHERE decision.copyright_notice_id = ${noticeId} AND decision.jurisdiction = 'eu_dsa'
      AND `
  parentQuery.append(territorialDecisionIsLiveSql())
  parentQuery.append(sql` FOR UPDATE OF decision`)
  const { rows } = await transaction<{ id: string; requester_user_id: string | null }>(parentQuery)
  const parent = rows[0]
  assert(parent, 404, 'EU copyright decision not found')
  if (input.referredByParty === 'notifier') {
    assert(
      input.referredByUserId === parent.requester_user_id,
      422,
      'referred_by_id must name the notifier',
    )
  } else {
    assert(input.referredByUserId, 422, 'referred_by_id must name a poster')
    const { rows: posters } = await transaction<{ is_poster: boolean }>(sql`
      /* recordEuDisputeSettlementReferral:poster */
      SELECT EXISTS (
        SELECT 1 FROM copyright_notice_targets target
        JOIN image_placements binding ON binding.placement_id = target.placement_id
        JOIN posts post ON post.id = binding.post_id
        WHERE target.copyright_notice_id = ${noticeId}
          AND post.created_by_id = ${input.referredByUserId}
      ) AS is_poster
    `)
    assert(posters[0]?.is_poster, 422, 'referred_by_id must name a poster')
  }
  const { rows: referrals } = await transaction<EuDisputeSettlementReferral>(sql`
    /* recordEuDisputeSettlementReferral */
    INSERT INTO copyright_eu_dispute_settlement_referrals (
      copyright_notice_id, jurisdiction, copyright_territorial_decision_id, body_name,
      referred_at, referred_by_party, referred_by_id, recorded_by_id
    ) VALUES (
      ${noticeId}, 'eu_dsa', ${parent.id}, ${bodyName}, ${input.referredAt},
      ${input.referredByParty}, ${input.referredByUserId}, ${currentUser.id}
    ) RETURNING id, copyright_territorial_decision_id
  `)
  const referral = referrals[0]
  assert(referral, 500, 'EU dispute settlement referral was not recorded')
  await transaction.commit()
  return referral
}

/** Records the body's one outcome without changing any restriction. */
export async function recordEuDisputeSettlementOutcome(
  currentUser: PrivateUser,
  noticeId: string,
  referralId: string,
  input: { result: EuDisputeSettlementResult; decidedAt: Date },
): Promise<EuDisputeSettlementOutcome> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  assert(
    ['decided_for_recipient', 'decided_for_platform', 'withdrawn', 'no_decision'].includes(
      input.result,
    ),
    422,
    'result is required',
  )
  assertValidDate(input.decidedAt, 'decided_at')
  await using transaction = await beginTransaction()
  const { rows: referrals } = await transaction<{ referred_at: Date }>(sql`
    /* recordEuDisputeSettlementOutcome:referral */
    SELECT referred_at FROM copyright_eu_dispute_settlement_referrals
    WHERE id = ${referralId} AND copyright_notice_id = ${noticeId} AND jurisdiction = 'eu_dsa'
    FOR UPDATE
  `)
  const referral = referrals[0]
  assert(referral, 404, 'EU dispute settlement referral not found')
  assert(input.decidedAt >= referral.referred_at, 422, 'decided_at must follow referred_at')
  const { rows: outcomes } = await transaction<EuDisputeSettlementOutcome>(sql`
    /* recordEuDisputeSettlementOutcome */
    INSERT INTO copyright_eu_dispute_settlement_outcomes (
      copyright_eu_dispute_settlement_referral_id, decided_at, result, recorded_by_id
    ) VALUES (${referralId}, ${input.decidedAt}, ${input.result}, ${currentUser.id})
    ON CONFLICT (copyright_eu_dispute_settlement_referral_id) DO NOTHING
    RETURNING id, result, implemented_at
  `)
  const outcome = outcomes[0]
  assert(outcome, 409, 'EU dispute settlement outcome already recorded')
  await transaction.commit()
  return outcome
}

/** Records a separate staff implementation after a recipient-favorable outcome. */
export async function recordEuDisputeSettlementImplementation(
  currentUser: PrivateUser,
  noticeId: string,
  referralId: string,
  implementedAt: Date,
): Promise<EuDisputeSettlementOutcome> {
  assert(currentUserCanReviewCopyrightNotices(currentUser), 403, 'Forbidden')
  assertValidDate(implementedAt, 'implemented_at')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
    result: EuDisputeSettlementResult
    decided_at: Date
    implemented_at: Date | null
  }>(sql`/* recordEuDisputeSettlementImplementation:outcome */
    SELECT outcome.id, outcome.result, outcome.decided_at, outcome.implemented_at
    FROM copyright_eu_dispute_settlement_outcomes outcome
    JOIN copyright_eu_dispute_settlement_referrals referral
      ON referral.id = outcome.copyright_eu_dispute_settlement_referral_id
    WHERE referral.id = ${referralId} AND referral.copyright_notice_id = ${noticeId}
      AND referral.jurisdiction = 'eu_dsa'
    FOR UPDATE OF outcome
  `)
  const outcome = rows[0]
  assert(outcome, 404, 'EU dispute settlement outcome not found')
  assert(
    outcome.result === 'decided_for_recipient',
    422,
    'Only a recipient-favorable outcome can be implemented',
  )
  assert(!outcome.implemented_at, 409, 'EU dispute settlement outcome already implemented')
  assert(implementedAt >= outcome.decided_at, 422, 'implemented_at must follow decided_at')
  const { rows: updated } = await transaction<EuDisputeSettlementOutcome>(sql`
    /* recordEuDisputeSettlementImplementation */
    UPDATE copyright_eu_dispute_settlement_outcomes SET implemented_at = ${implementedAt}
    WHERE id = ${outcome.id} RETURNING id, result, implemented_at
  `)
  assert(updated[0], 500, 'EU dispute settlement implementation was not recorded')
  await transaction.commit()
  return updated[0]
}

function assertValidDate(value: Date, field: string): void {
  assert(value instanceof Date && !Number.isNaN(value.getTime()), 422, `${field} is required`)
}
