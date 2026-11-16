import sql from 'sql-template-strings'

/** Write each affected case clock in identity order before its correspondence children. */
export function advanceCopyrightCorrespondenceNotices(
  inputs: readonly { noticeId: string; submissionId: string | null }[],
) {
  return sql`
    WITH written_notices AS (
      SELECT notice.id FROM copyright_notices notice
      WHERE notice.id = ANY(${inputs.map(input => input.noticeId)}::uuid[])
        AND EXISTS (
        SELECT 1 FROM unnest(
          ${inputs.map(input => input.noticeId)}::uuid[],
          ${inputs.map(input => input.submissionId)}::uuid[]
        ) AS input(notice_id, submission_id)
        WHERE input.notice_id = notice.id
          AND (input.submission_id IS NULL OR EXISTS (
            SELECT 1 FROM copyright_notice_submissions submission
            WHERE submission.id = input.submission_id
              AND submission.copyright_notice_id = notice.id
          ))
      )
      ORDER BY notice.id
      FOR NO KEY UPDATE OF notice
    ), advanced AS (
    UPDATE copyright_notices notice
    SET last_legal_activity_at = GREATEST(notice.last_legal_activity_at, clock_timestamp())
    FROM written_notices WHERE notice.id = written_notices.id
    RETURNING notice.id
    )
  `
}
