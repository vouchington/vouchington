import { beginTransaction } from '@data-stores/psql'

/** Simulates source work disappearance while retaining the durable moderation outcome. */
export async function deleteModerationWorkForAdmissionTest(versionId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* unlinkModerationAttemptsForAdmissionTest */
    UPDATE post_moderation_dispositions SET attempt_id = NULL
    WHERE version_id = $1`,
    [versionId],
  )
  await query(
    `/* deleteModerationWorkForAdmissionTest */
    DELETE FROM post_moderation_work_items WHERE version_id = $1`,
    [versionId],
  )
  await query.commit()
}
