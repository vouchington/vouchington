import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '../services/users/types.mts'
import { insertCopyrightEmailIntakeNoticeLink } from '../services/copyright-notices/email-thread-link.mts'

/** The production borrowed link producer plus its canonical manual audit, committed before guard tests. */
export async function seedCopyrightAssociationInTransaction(
  currentUser: PrivateUser,
  intakeId: string,
  noticeId: string,
) {
  await using transaction = await beginTransaction()
  const linked = await insertCopyrightEmailIntakeNoticeLink(transaction, {
    intakeId,
    noticeId,
    linkKind: 'thread',
  })
  if (!linked) throw new Error('Owned manual association prerequisite was not linked')
  await transaction(sql`/* seedCopyrightAssociationInTransaction:audit */
    INSERT INTO copyright_notice_lifecycle_changes
      (copyright_notice_id, change_type, changed_by_id, copyright_notice_email_intake_id)
    VALUES (${noticeId}, 'email_intake_manually_associated', ${currentUser.id}, ${intakeId})`)
  await transaction.commit()
}
