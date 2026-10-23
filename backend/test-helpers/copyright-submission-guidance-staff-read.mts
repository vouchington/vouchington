import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_RETENTION_ERASURE } from '../services/copyright-notices/retention-erasure-spec.mts'
import { eraseCopyrightRetentionTableSql } from '../services/copyright-notices/retention-erasure-update-sql.mts'

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
  await transaction(eraseCopyrightRetentionTableSql(spec, noticeId))
  await transaction.commit()
}
