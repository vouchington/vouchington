import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightErasureWork } from './retention-erasure-progress.mts'
import { deleteCopyrightEvidenceObjectVersionPage } from './retention-erasure-s3.mts'

/** One raw object identity precedes the fresh indexed exclusivity proof and one provider page. */
export async function eraseCopyrightRawObjectPage(
  query: TransactionQuery,
  noticeId: string,
  work: CopyrightErasureWork,
  pageSize: number,
): Promise<void> {
  if (work.erasure_table_index > 1) throw new Error('Invalid copyright raw-object owner phase')
  const statement =
    work.erasure_table_index === 0
      ? sql`/* selectCopyrightErasureIntakeObjectPage */
      SELECT link.copyright_notice_email_intake_receipt_id AS id, intake.raw_storage_object_id AS object_id
      FROM copyright_notice_email_intake_notice_links link
      JOIN copyright_notice_email_intakes intake ON intake.id = link.copyright_notice_email_intake_receipt_id
      WHERE link.copyright_notice_id = ${noticeId}
        AND (${work.erasure_object_owner_cursor}::uuid IS NULL OR link.copyright_notice_email_intake_receipt_id > ${work.erasure_object_owner_cursor}::uuid)
      ORDER BY link.copyright_notice_email_intake_receipt_id LIMIT 1`
      : sql`/* selectCopyrightErasureArtifactObjectPage */
      SELECT id, storage_object_id AS object_id FROM copyright_notice_evidence_artifacts
      WHERE copyright_notice_id = ${noticeId}
        AND (${work.erasure_object_owner_cursor}::uuid IS NULL OR id > ${work.erasure_object_owner_cursor}::uuid)
      ORDER BY id LIMIT 1`
  const { rows } = await query<{ id: string; object_id: string | null }>(statement)
  const owner = rows[0]
  if (!owner) {
    await query(sql`/* advanceCopyrightRawObjectOwnerPhase */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_stage_index = ${work.erasure_table_index === 1 ? 2 : 1},
        erasure_table_index = ${work.erasure_table_index === 1 ? 0 : 1}, erasure_object_owner_cursor = NULL
      WHERE copyright_notice_identity_id = ${noticeId}`)
    return
  }
  const objectId = owner.object_id
  if (!objectId) {
    await query(sql`/* skipCopyrightOwnerWithoutRawObject */ UPDATE copyright_notice_minimal_purge_continuations
      SET erasure_object_owner_cursor = ${owner.id} WHERE copyright_notice_identity_id = ${noticeId}`)
    return
  }
  const { rows: objects } = await query<{ storage_key: string; erased_at: Date | null }>(sql`
    /* lockCopyrightErasureObjectPage */ SELECT storage_key, erased_at FROM copyright_notice_storage_objects
    WHERE id = ${objectId} FOR UPDATE`)
  const object = objects[0]
  if (!object) throw new Error('Copyright raw object reference lost its registry')
  const { rows: exclusive } = await query(sql`/* proveCopyrightErasureObjectExclusive */
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM copyright_notice_email_intakes other WHERE other.raw_storage_object_id = ${objectId}
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
          WHERE link.copyright_notice_email_intake_receipt_id = other.id AND link.copyright_notice_id = ${noticeId}))
    AND NOT EXISTS (SELECT 1 FROM copyright_notice_evidence_artifacts other
      WHERE other.storage_object_id = ${objectId} AND other.copyright_notice_id <> ${noticeId})`)
  let newlyErased = false
  if (exclusive.length && !object.erased_at) {
    if ((await deleteCopyrightEvidenceObjectVersionPage(object.storage_key, pageSize)).hasMore)
      return
    await query(sql`/* fenceErasedCopyrightStorageObject */ UPDATE copyright_notice_storage_objects
      SET erased_at = clock_timestamp() WHERE id = ${objectId} AND erased_at IS NULL`)
    newlyErased = true
  }
  await query(sql`/* checkpointCopyrightRawObjectErasure */ UPDATE copyright_notice_minimal_purge_continuations
    SET erasure_object_owner_cursor = ${owner.id}, erased_object_count = erased_object_count + ${newlyErased ? 1 : 0}
    WHERE copyright_notice_identity_id = ${noticeId}`)
}
