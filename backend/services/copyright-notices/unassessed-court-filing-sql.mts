import sql, { type SQLStatement } from 'sql-template-strings'

/** A filing blocks the whole case until staff record its legal-hold assessment. */
export function unassessedCourtFilingSql(noticeId: SQLStatement): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM copyright_notice_submissions unassessed_filing
    WHERE unassessed_filing.copyright_notice_id = `.append(noticeId).append(sql`
      AND unassessed_filing.kind = 'court_or_ccb_hold'
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_legal_hold_assessments filing_assessment
        WHERE filing_assessment.copyright_notice_submission_id = unassessed_filing.id
      )
  )`)
}
