import sql from 'sql-template-strings'

/** All fragments correlate to the copyright_restrictions alias `restriction`. */
export const reverseReviewSourceSql = sql`(restriction.human_review_action IS NOT DISTINCT FROM 'reverse')`

export const appealReversalSourceSql = sql`EXISTS (
  SELECT 1 FROM copyright_notice_appeal_reviews appeal_review
  WHERE appeal_review.copyright_restriction_id = restriction.id
    AND appeal_review.action = 'reverse'
)`

export const administratorLiftSourceSql = sql`EXISTS (
  SELECT 1 FROM copyright_restriction_administrator_lifts administrator_lift
  WHERE administrator_lift.copyright_restriction_id = restriction.id
)`

/** Reversal authority is scoped to the assessment of this territorial decision. */
export const territorialComplaintReversalSourceSql = sql`EXISTS (
  SELECT 1 FROM copyright_territorial_decisions decision
  JOIN copyright_territorial_redress_requests request
    ON request.copyright_territorial_decision_id = decision.id
  JOIN copyright_territorial_redress_decisions redress
    ON redress.copyright_territorial_redress_request_id = request.id
  WHERE decision.copyright_notice_submission_assessment_id = restriction.authorizing_assessment_id
    AND decision.outcome = 'restrict' AND redress.staff_disposition = 'revoke'
)`

/** Correlates to an assessment alias before a restriction has been created. */
export const territorialAssessmentRevokedSql = sql`EXISTS (
  SELECT 1 FROM copyright_territorial_decisions territorial_decision
  JOIN copyright_territorial_redress_requests territorial_request
    ON territorial_request.copyright_territorial_decision_id = territorial_decision.id
  JOIN copyright_territorial_redress_decisions territorial_redress
    ON territorial_redress.copyright_territorial_redress_request_id = territorial_request.id
  WHERE territorial_decision.copyright_notice_submission_assessment_id = assessment.id
    AND territorial_decision.outcome = 'restrict'
    AND territorial_redress.staff_disposition = 'revoke'
)`

/**
 * The restriction was restored under the 17 U.S.C. 512(g) counter-notice process: a completed
 * restore intent carries the counter-notice deadline that authorized it. The notifier filed no
 * court action, so this is a procedural outcome rather than a finding that the restriction was
 * wrong, and it is deliberately not part of `anyReversalSourceSql`. Only the repeat-infringer
 * incident sync and staydown registration treat it as ending the restriction's consequences.
 * `state = 'completed'` matters: `stale`, `blocked` and `failed` intents also set `completed_at`.
 */
export const statutoryRestorationSourceSql = sql`EXISTS (
  SELECT 1 FROM copyright_notice_action_intents statutory_intent
  WHERE statutory_intent.copyright_restriction_id = restriction.id
    AND statutory_intent.action = 'restore'
    AND statutory_intent.state = 'completed'
    AND statutory_intent.copyright_notice_deadline_id IS NOT NULL
)`

export const anyReversalSourceSql = sql`(`
  .append(reverseReviewSourceSql)
  .append(sql` OR `)
  .append(appealReversalSourceSql)
  .append(sql` OR `)
  .append(administratorLiftSourceSql)
  .append(sql` OR `)
  .append(territorialComplaintReversalSourceSql)
  .append(sql`)`)
