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

export const anyReversalSourceSql = sql`(`
  .append(reverseReviewSourceSql)
  .append(sql` OR `)
  .append(appealReversalSourceSql)
  .append(sql` OR `)
  .append(administratorLiftSourceSql)
  .append(sql`)`)
