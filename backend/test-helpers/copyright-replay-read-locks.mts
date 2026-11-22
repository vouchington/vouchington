import { beginTransaction } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { openHeldCounterNoticeRestore } from './copyright-restoration-hold-scene.mts'

type Scene = Awaited<ReturnType<typeof openHeldCounterNoticeRestore>>

/** A second connection can lock (FOR NO KEY UPDATE, compatible with an FK key share) every row the replay read: none is held by the replaying transaction. */
export async function readRowsAreUnlocked(
  scene: Scene,
  hold: { submissionId?: string; assessmentId?: string },
) {
  await using other = await beginTransaction()
  const deadlineId = scene.restore.copyright_notice_deadline_id
  const unlocked = async (statement: SQLStatement) => (await other(statement)).rows.length === 1
  return {
    intent: await unlocked(sql`/* readRowsAreUnlocked:intent */
      SELECT id FROM copyright_notice_action_work_items
      WHERE id = ${scene.restore.id} FOR NO KEY UPDATE SKIP LOCKED`),
    restriction: await unlocked(sql`/* readRowsAreUnlocked:restriction */
      SELECT id FROM copyright_restrictions
      WHERE id = ${scene.restriction.id} FOR NO KEY UPDATE SKIP LOCKED`),
    target: await unlocked(sql`/* readRowsAreUnlocked:target */
      SELECT id FROM copyright_notice_targets
      WHERE id = ${scene.target.id} FOR NO KEY UPDATE SKIP LOCKED`),
    deadline: await unlocked(sql`/* readRowsAreUnlocked:deadline */
      SELECT id FROM copyright_notice_deadlines
      WHERE id = ${deadlineId} FOR NO KEY UPDATE SKIP LOCKED`),
    submission: await unlocked(sql`/* readRowsAreUnlocked:submission */
      SELECT id FROM copyright_notice_submissions
      WHERE id = ${hold.submissionId ?? null} FOR NO KEY UPDATE SKIP LOCKED`),
    assessment: await unlocked(sql`/* readRowsAreUnlocked:assessment */
      SELECT id FROM copyright_notice_legal_hold_assessments
      WHERE id = ${hold.assessmentId ?? null} FOR NO KEY UPDATE SKIP LOCKED`),
  }
}
