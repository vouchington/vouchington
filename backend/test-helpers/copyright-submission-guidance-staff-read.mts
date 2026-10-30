import { eraseCopyrightRetentionTableSql } from '../services/copyright-notices/retention-erasure-update-sql.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_RETENTION_ERASURE } from '../services/copyright-notices/retention-erasure-spec.mts'

const TEST_ERASURE_PAGE_SIZE = 10

/** Runs the policy's actual ciphertext overwrite for one case so the read model sees its sentinel. */
export async function eraseTestCopyrightSubmissionGuidanceForNotice(
  noticeId: string,
): Promise<void> {
  const spec = COPYRIGHT_RETENTION_ERASURE.find(
    entry => entry.table === 'copyright_notice_submission_guidance',
  )
  if (!spec) throw new Error('Submission guidance is absent from copyright retention policy')
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* eraseTestCopyrightSubmissionGuidanceForNotice */ SET LOCAL app.copyright_retention_erasure = 'on'`,
  )
  const { rows } = await transaction<{ scanned: number; updated: number }>(
    eraseCopyrightRetentionTableSql(spec, noticeId, TEST_ERASURE_PAGE_SIZE),
  )
  if (!rows[0] || rows[0].updated !== rows[0].scanned || rows[0].scanned > TEST_ERASURE_PAGE_SIZE)
    throw new Error('Expected every test submission-guidance row to fit and be erased in one page')
  await transaction.commit()
}
