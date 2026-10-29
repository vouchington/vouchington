import type { CopyrightRationaleRetentionProbe } from './copyright-rationale-retention-scene-types.mts'
import { beginTransaction } from '@data-stores/psql'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'

type Jurisdiction = 'eu_dsa' | 'uk'
/** Test the real rationale eligibility function and DELETE guard; all fixture DML rolls back. */
export async function withCopyrightRationaleRetentionScene(
  run: (probe: CopyrightRationaleRetentionProbe) => Promise<void>,
) {
  await using query = await beginTransaction()
  const now = new Date()
  const oldAt = new Date(Date.UTC(now.getUTCFullYear() - 8, 0, 15))
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 6, now.getUTCMonth(), now.getUTCDate()))
  const { rows: actors } = await query<{ id: string }>(sql`
    /* rationaleRetentionActor */ INSERT INTO users DEFAULT VALUES RETURNING id`)
  const actorId = actors[0]!.id

  async function newAccount(): Promise<string> {
    const { rows } = await query<{ id: string }>(sql`
      /* rationaleRetentionAccount */ INSERT INTO users DEFAULT VALUES RETURNING id`)
    return rows[0]!.id
  }
  async function rationale(owner: { noticeId?: string; reviewId?: string; accountId?: string }) {
    const id = uuidv7({ msecs: oldAt.getTime() })
    await query(sql`/* rationaleRetentionAttempt */
      INSERT INTO copyright_decision_rationales
        (id, copyright_notice_id, copyright_repeat_infringer_review_id,
         account_user_id, recorded_by_id, tool_name, rationale_ciphertext)
      VALUES (${id}, ${owner.noticeId ?? null}, ${owner.reviewId ?? null},
        ${owner.accountId ?? null}, ${actorId}, 'replay_copyright_intent',
        ${encryptSecret('old attempted rationale', `copyright-decision-rationale:${id}`)})`)
    return id
  }
  async function createCase(jurisdiction: Jurisdiction) {
    const claimantId = await newAccount()
    const { rows } = await query<{ id: string }>(sql`/* rationaleRetentionCase */
      INSERT INTO copyright_notices
        (jurisdiction, legal_basis, received_at, claimant_user_id,
         claimant_contact_ciphertext, work_description, policy_version)
      VALUES (${jurisdiction}, 'copyright', ${oldAt}, ${claimantId}, 'contact', 'work', 'test')
      RETURNING id`)
    const noticeId = rows[0]!.id
    const decisionId = uuidv7()
    await query(sql`/* rationaleRetentionDecisionIdentity */
      INSERT INTO copyright_territorial_decision_identities (id, copyright_notice_id, jurisdiction)
      VALUES (${decisionId}, ${noticeId}, ${jurisdiction})`)
    await query(sql`/* rationaleRetentionCaseCurrentResult */
      UPDATE copyright_notices SET current_territorial_decision_identity_id = ${decisionId},
        territorial_decision_outcome = 'no_action', territorial_decided_at = CURRENT_TIMESTAMP,
        territorial_decided_by_id = ${actorId},
        territorial_rationale_ciphertext = ${encryptSecret('final reason', `${territorialLabels(jurisdiction).decisionPurpose}:${noticeId}`)},
        territorial_public_explanation_ciphertext = 'final explanation'
      WHERE id = ${noticeId}`)
    return { noticeId, claimantId, rationaleId: await rationale({ noticeId }) }
  }
  async function createReview() {
    const accountId = await newAccount()
    const reviewIdentityId = uuidv7()
    const reviewEventId = uuidv7()
    await query(sql`/* rationaleRetentionReviewIdentity */
      INSERT INTO copyright_repeat_infringer_review_identities (id, account_user_id)
      VALUES (${reviewIdentityId}, ${accountId})`)
    await query(sql`/* rationaleRetentionReviewEvent */
      INSERT INTO copyright_repeat_infringer_reviews
        (id, account_user_id, copyright_repeat_infringer_review_identity_id,
         opened_at, outcome, outcome_at, outcome_by_id, rationale_ciphertext)
      VALUES (${reviewEventId}, ${accountId}, ${reviewIdentityId}, ${oldAt},
        'no_action', ${oldAt}, ${actorId},
        ${encryptSecret('review reason', `copyright-repeat-infringer-review:${reviewIdentityId}`)})`)
    await query(sql`/* rationaleRetentionReviewCurrentResult */
      INSERT INTO copyright_repeat_infringer_account_states
        (account_user_id, current_decided_review_identity_id, current_outcome,
         current_outcome_at, current_outcome_by_id, current_outcome_rationale_ciphertext)
      VALUES (${accountId}, ${reviewIdentityId}, 'no_action', ${oldAt}, ${actorId},
        ${encryptSecret('review reason', `copyright-repeat-infringer-review:${reviewIdentityId}`)})`)
    return {
      reviewIdentityId,
      reviewEventId,
      rationaleId: await rationale({ reviewId: reviewIdentityId }),
    }
  }
  async function createAccountTermination() {
    const accountId = await newAccount()
    const reviewId = uuidv7()
    await query(sql`/* rationaleRetentionTerminationIdentity */
      INSERT INTO copyright_repeat_infringer_review_identities (id, account_user_id)
      VALUES (${reviewId}, ${accountId})`)
    await query(sql`/* rationaleRetentionTerminationOwner */
      INSERT INTO copyright_repeat_infringer_account_states
        (account_user_id, termination_in_effect, effective_termination_review_identity_id,
         effective_termination_decided_at, effective_termination_decided_by_id,
         effective_termination_rationale_ciphertext, current_decided_review_identity_id,
         current_outcome, current_outcome_at, current_outcome_by_id,
         current_outcome_rationale_ciphertext)
      VALUES (${accountId}, true, ${reviewId}, ${oldAt}, ${actorId},
        ${encryptSecret('effective termination explanation', `copyright-repeat-infringer-review:${reviewId}`)},
        ${reviewId}, 'terminate', ${oldAt}, ${actorId},
        ${encryptSecret('current termination explanation', `copyright-repeat-infringer-review:${reviewId}`)})`)
    return { accountId, rationaleId: await rationale({ accountId }) }
  }
  async function hold(accountId: string) {
    const { rows } = await query<{ id: string }>(sql`/* rationaleRetentionHold */
      INSERT INTO user_legal_preservation_holds
        (account_user_id, placed_by_id, reference_ciphertext)
      VALUES (${accountId}, ${actorId}, 'hold') RETURNING id`)
    return rows[0]!.id
  }
  async function release(holdId: string) {
    await query(sql`/* rationaleRetentionRelease */
      UPDATE user_legal_preservation_holds SET released_at = CURRENT_TIMESTAMP,
        released_by_id = ${actorId} WHERE id = ${holdId}`)
  }
  async function eligible(rationaleId: string) {
    const { rows } = await query<{ eligible: boolean }>(sql`/* rationaleRetentionEligible */
      SELECT fn_copyright_decision_rationale_retention_eligible(target, ${cutoff}) AS eligible
      FROM copyright_decision_rationales target WHERE target.id = ${rationaleId}`)
    return rows[0]?.eligible ?? false
  }
  async function deleteEligible(rationaleId: string) {
    await query(sql`/* rationaleRetentionCutoff */
      SELECT set_config('app.copyright_rationale_retention_cutoff', ${cutoff.toISOString()}, true)`)
    const result = await query(sql`/* rationaleRetentionDelete */
      DELETE FROM copyright_decision_rationales target
      WHERE target.id = ${rationaleId}
        AND fn_copyright_decision_rationale_retention_eligible(target, ${cutoff})`)
    return result.rowCount ?? 0
  }
  async function caseResult(noticeId: string) {
    const { rows } = await query<{
      outcome: string
      rationale: string
      jurisdiction: Jurisdiction
    }>(sql`
      /* rationaleRetentionReadCaseResult */
      SELECT jurisdiction, territorial_decision_outcome AS outcome,
        territorial_rationale_ciphertext AS rationale
      FROM copyright_notices WHERE id = ${noticeId}`)
    const row = rows[0]!
    return {
      outcome: row.outcome,
      rationale: decryptSecret(
        row.rationale,
        `${territorialLabels(row.jurisdiction).decisionPurpose}:${noticeId}`,
      ),
    }
  }
  async function accountResult(accountId: string) {
    const { rows } = await query<{
      outcome: string
      currentRationale: string
      effectiveRationale: string
      currentReviewId: string
      effectiveReviewId: string
    }>(sql`/* rationaleRetentionReadAccountResult */
      SELECT current_outcome AS outcome,
        current_outcome_rationale_ciphertext AS "currentRationale",
        effective_termination_rationale_ciphertext AS "effectiveRationale",
        current_decided_review_identity_id AS "currentReviewId",
        effective_termination_review_identity_id AS "effectiveReviewId"
      FROM copyright_repeat_infringer_account_states WHERE account_user_id = ${accountId}`)
    const row = rows[0]!
    return {
      outcome: row.outcome,
      currentRationale: decryptSecret(
        row.currentRationale,
        `copyright-repeat-infringer-review:${row.currentReviewId}`,
      ),
      effectiveRationale: decryptSecret(
        row.effectiveRationale,
        `copyright-repeat-infringer-review:${row.effectiveReviewId}`,
      ),
    }
  }
  await run({
    createCase,
    createReview,
    createAccountTermination,
    hold,
    release,
    eligible,
    deleteEligible,
    caseResult,
    accountResult,
  })
  await query.rollback()
}
