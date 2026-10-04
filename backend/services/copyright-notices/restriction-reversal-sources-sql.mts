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

export const anyReversalSourceSql = sql`(`
  .append(reverseReviewSourceSql)
  .append(sql` OR `)
  .append(appealReversalSourceSql)
  .append(sql` OR `)
  .append(administratorLiftSourceSql)
  .append(sql` OR `)
  .append(territorialComplaintReversalSourceSql)
  .append(sql`)`)
