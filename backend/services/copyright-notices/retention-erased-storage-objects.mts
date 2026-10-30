import { beginBoundedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Raw rows are already physically erased. Only their payload-free registry handles remain. */
export async function cleanupCopyrightErasedStorageObjects(
  pageSize: number,
): Promise<{ deleted: number; hasMore: boolean }> {
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await query(sql`/* ensureCopyrightErasedObjectCursor */ INSERT INTO copyright_key_orphan_cleanup_cursors (is_singleton)
    VALUES (true) ON CONFLICT DO NOTHING`)
  const { rows: cursors } = await query<{ cursor_storage_object_id: string | null }>(sql`
    /* lockCopyrightErasedObjectCursor */ SELECT cursor_storage_object_id FROM copyright_key_orphan_cleanup_cursors
    WHERE is_singleton FOR UPDATE`)
  const { rows } = await query<{ id: string }>(sql`/* selectCopyrightErasedObjectRegistryPage */
    SELECT id FROM copyright_notice_storage_objects WHERE erased_at IS NOT NULL
      AND (${cursors[0]?.cursor_storage_object_id}::uuid IS NULL OR id > ${cursors[0]?.cursor_storage_object_id}::uuid)
    ORDER BY id LIMIT ${pageSize + 1}`)
  const page = rows.slice(0, pageSize)
  const { rowCount } = await query(sql`/* deleteCopyrightErasedObjectRegistryPage */
    DELETE FROM copyright_notice_storage_objects object WHERE object.id = ANY(${page.map(row => row.id)}::uuid[])
      AND object.erased_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intakes intake WHERE intake.raw_storage_object_id = object.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_evidence_artifacts artifact WHERE artifact.storage_object_id = object.id)`)
  const hasMore = rows.length > pageSize
  await query(sql`/* checkpointCopyrightErasedObjectCursor */ UPDATE copyright_key_orphan_cleanup_cursors
    SET cursor_storage_object_id = ${hasMore ? page.at(-1)?.id : null}::uuid WHERE is_singleton`)
  await query.commit()
  return { deleted: rowCount ?? 0, hasMore }
}
