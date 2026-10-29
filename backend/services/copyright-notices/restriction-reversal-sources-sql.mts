import sql from 'sql-template-strings'

/** Fresh fragments correlate to the copyright_restrictions alias `restriction`. */
export function reverseReviewSourceSql() {
  return sql`(restriction.human_review_action IS NOT DISTINCT FROM 'reverse')`
}

export function appealReversalSourceSql() {
  return sql`EXISTS (
  SELECT 1 FROM copyright_notice_appeal_reviews appeal_review
  WHERE appeal_review.copyright_restriction_id = restriction.id
    AND appeal_review.action = 'reverse'
)`
}

export function administratorLiftSourceSql() {
  return sql`(restriction.administrator_lift_decided_at IS NOT NULL)`
}

/** Reversal authority is scoped to the assessment of this territorial decision. */
export function territorialComplaintReversalSourceSql() {
  return sql`EXISTS (
  SELECT 1 FROM copyright_territorial_redress_requests request
  WHERE request.authorizing_assessment_identity_id = restriction.authorizing_assessment_id
    AND request.challenged_decision_outcome = 'restrict'
    AND request.staff_disposition = 'revoke'
)`
}

/** Correlates to an assessment alias before a restriction has been created. */
export function territorialAssessmentRevokedSql() {
  return sql`EXISTS (
  SELECT 1 FROM copyright_territorial_redress_requests territorial_request
  WHERE territorial_request.authorizing_assessment_identity_id = assessment.id
    AND territorial_request.challenged_decision_outcome = 'restrict'
    AND territorial_request.staff_disposition = 'revoke'
)`
}

/**
 * The restriction was restored under the 17 U.S.C. 512(g) counter-notice process: a completed
 * restore intent carries the counter-notice deadline that authorized it. The notifier filed no
 * court action, so this is a procedural outcome rather than a finding that the restriction was
 * wrong, and it is deliberately not part of `anyReversalSourceSql`. Only the repeat-infringer
 * incident sync and staydown registration treat it as ending the restriction's consequences.
 * `state = 'completed'` matters: `stale`, `blocked` and `failed` intents also set `completed_at`.
 */
export function statutoryRestorationSourceSql() {
  return sql`EXISTS (
  SELECT 1 FROM copyright_notice_action_work_items statutory_intent
  WHERE statutory_intent.copyright_restriction_id = restriction.id
    AND statutory_intent.action = 'restore'
    AND statutory_intent.state = 'completed'
    AND statutory_intent.copyright_notice_deadline_id IS NOT NULL
)`
}

export function anyReversalSourceSql() {
  return sql`(`
    .append(reverseReviewSourceSql())
    .append(sql` OR `)
    .append(appealReversalSourceSql())
    .append(sql` OR `)
    .append(administratorLiftSourceSql())
    .append(sql` OR `)
    .append(territorialComplaintReversalSourceSql())
    .append(sql`)`)
}
