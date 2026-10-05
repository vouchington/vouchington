import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Deliberately bypasses service validation to verify immutable storage guards. */
export function rewriteTestEuDisputeSettlementReferral(referralId: string) {
  return write(sql`/* rewriteTestEuDisputeSettlementReferral */
    UPDATE copyright_eu_dispute_settlement_referrals SET body_name = 'Rewritten'
    WHERE id = ${referralId}`)
}

export function deleteTestEuDisputeSettlementReferral(referralId: string) {
  return write(sql`/* deleteTestEuDisputeSettlementReferral */
    DELETE FROM copyright_eu_dispute_settlement_referrals WHERE id = ${referralId}`)
}

export function insertTestEuDisputeSettlementEarlyOutcome(referralId: string, decidedAt: Date) {
  return write(sql`/* insertTestEuDisputeSettlementEarlyOutcome */
    INSERT INTO copyright_eu_dispute_settlement_outcomes (
      copyright_eu_dispute_settlement_referral_id, decided_at, result
    ) VALUES (${referralId}, ${decidedAt}, 'decided_for_recipient')`)
}

export function rewriteTestEuDisputeSettlementOutcome(outcomeId: string) {
  return write(sql`/* rewriteTestEuDisputeSettlementOutcome */
    UPDATE copyright_eu_dispute_settlement_outcomes SET result = 'no_decision'
    WHERE id = ${outcomeId}`)
}

export function deleteTestEuDisputeSettlementOutcome(outcomeId: string) {
  return write(sql`/* deleteTestEuDisputeSettlementOutcome */
    DELETE FROM copyright_eu_dispute_settlement_outcomes WHERE id = ${outcomeId}`)
}

export function prematurelyImplementTestEuDisputeSettlementOutcome(outcomeId: string, when: Date) {
  return write(sql`/* prematurelyImplementTestEuDisputeSettlementOutcome */
    UPDATE copyright_eu_dispute_settlement_outcomes SET implemented_at = ${when}
    WHERE id = ${outcomeId}`)
}

export function eraseTestEuDisputeSettlementReferralActors(referralId: string) {
  return write(sql`/* eraseTestEuDisputeSettlementReferralActors */
    UPDATE copyright_eu_dispute_settlement_referrals
    SET referred_by_id = NULL, recorded_by_id = NULL WHERE id = ${referralId}`)
}

export function eraseTestEuDisputeSettlementOutcomeRecorder(outcomeId: string) {
  return write(sql`/* eraseTestEuDisputeSettlementOutcomeRecorder */
    UPDATE copyright_eu_dispute_settlement_outcomes SET recorded_by_id = NULL
    WHERE id = ${outcomeId}`)
}
