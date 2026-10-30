import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightRetentionPositiveReportProofProgress = {
  phase_index: number
  pending_child_count: number
}

/** Reads only the continuation phase and remaining child counts for a real test case. */
export async function readCopyrightRetentionPositiveReportProofProgress(
  noticeId: string,
): Promise<CopyrightRetentionPositiveReportProofProgress> {
  const { rows } = await read<CopyrightRetentionPositiveReportProofProgress>(sql`
    /* readCopyrightRetentionPositiveReportProofProgress */
    SELECT work.phase_index,
      ((SELECT count(*) FROM copyright_notice_submissions child
        WHERE child.copyright_notice_id = ${noticeId})
        + (SELECT count(*) FROM copyright_notice_targets child
          WHERE child.copyright_notice_id = ${noticeId})
        + (SELECT count(*) FROM copyright_notice_evidence_artifacts child
          WHERE child.copyright_notice_id = ${noticeId}))::integer AS pending_child_count
    FROM copyright_notice_minimal_purge_continuations work
    WHERE work.copyright_notice_identity_id = ${noticeId}
  `)
  const progress = rows[0]
  if (!progress) throw new Error('Copyright retention purge progress is missing')
  return progress
}
