import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { stageImagePlacementDeliveryRecordPage } from './delivery-registry-staging-page.mts'

export async function replayFailedMediaDeliveryRegistryRecords(input?: {
  actorUserId?: string
  recordIds?: readonly string[]
  after?: string
}): Promise<{ replayed: number; after?: string; hasMore: boolean }> {
  const recordIds = input?.recordIds
    ? [...new Set(input.recordIds.map(id => id.toLowerCase()))].toSorted()
    : null
  const scope = JSON.stringify({
    operation: 'media-delivery-registry-replay',
    order: 'media-delivery-registry-record-id-asc',
    recordIds,
    actorUserId: input?.actorUserId?.toLowerCase() ?? null,
  })
  const after = input?.after
    ? decodeScopedUuidCursor(input.after, scope, 'Invalid media replay cursor').id
    : null
  if (recordIds?.length === 0) return { replayed: 0, hasMore: false }
  observeSharedDbScope(
    'replayFailedMediaDeliveryRegistryRecords',
    sharedDbIdsScope(input?.recordIds),
  )
  const limit = getMediaDeliverySafetyWorkLimit('registry_reconciliation_page_size')
  await using transaction = await beginTransaction()
  const candidates = sql`/* replayFailedMediaDeliveryRegistryRecords:lock */
    /* deadlock-safe: every replay chain locks authority rows in the same total record UUID order. */
    WITH candidates AS MATERIALIZED (
      SELECT media_delivery_registry_record_id FROM media_delivery_registry_projection_work_items
      WHERE failed_change_id IS NOT NULL`
  if (recordIds)
    candidates.append(sql` AND media_delivery_registry_record_id = ANY(${recordIds}::uuid[])`)
  if (after) candidates.append(sql` AND media_delivery_registry_record_id > ${after}::uuid`)
  candidates.append(sql`
      ORDER BY media_delivery_registry_record_id LIMIT ${limit}
    ) SELECT record.id FROM candidates
      JOIN media_delivery_registry_records record ON record.id = candidates.media_delivery_registry_record_id
    ORDER BY record.id FOR UPDATE OF record
  `)
  const { rows: locked } = await transaction<{ id: string }>(candidates)
  const ids = locked.map(record => record.id)
  // A new statement after row locks refreshes READ COMMITTED visibility for overlapping chains.
  const { rows } = await transaction<{
    media_delivery_registry_record_id: string
    placement_id: string
  }>(sql`
    /* replayFailedMediaDeliveryRegistryRecords */
    WITH inserted AS (
      INSERT INTO media_delivery_registry_changes(media_delivery_registry_record_id, generation, change_type, changed_by_id, failure_message)
      SELECT media_delivery_registry_record_id, generation, 'pending', ${input?.actorUserId ?? null}, 'Reopened by media delivery reconciliation.'
      FROM view_media_delivery_registry_current_records
      WHERE media_delivery_registry_record_id = ANY(${ids}::uuid[]) AND state = 'failed'
      ORDER BY media_delivery_registry_record_id
      RETURNING media_delivery_registry_record_id
    ) SELECT record.id AS media_delivery_registry_record_id, record.placement_id FROM inserted
      JOIN media_delivery_registry_records record ON record.id = inserted.media_delivery_registry_record_id
  `)
  if (input?.actorUserId && rows.length) {
    await transaction(sql`/* replayFailedMediaDeliveryRegistryRecords:event */
      INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
        media_delivery_registry_record_id, replay_reason)
      SELECT target.copyright_notice_id, 'media_delivery_registry_replayed', ${input.actorUserId},
        record.id, 'operator_replay'
      FROM media_delivery_registry_records record
      JOIN copyright_notice_targets target ON target.placement_id = record.placement_id
      WHERE record.id = ANY(${rows.map(row => row.media_delivery_registry_record_id)}::uuid[])
      ORDER BY record.id, target.id
    `)
  }
  await transaction.commit()
  return {
    replayed: rows.length,
    hasMore: locked.length === limit,
    after: locked.length ? encodeScopedUuidCursor(locked.at(-1)!.id, scope) : undefined,
  }
}

/** @public Scoped reconciliation seam exercised against real PostgreSQL delivery records. */
export async function stageCurrentImagePlacementDeliveryRecordsForImageIds(
  imageIds: readonly string[],
): Promise<number> {
  if (imageIds.length === 0) return 0
  return stageAllCurrentImagePlacementDeliveryRecords(imageIds)
}

/** Snapshot staging is advisory; the publisher repeats the proof under retained locks. */
export async function stageAllCurrentImagePlacementDeliveryRecords(
  imageIds?: readonly string[],
): Promise<number> {
  const page = await stageImagePlacementDeliveryRecordPage({ imageIds })
  return page.staged
}

export { stageImagePlacementDeliveryRecordPage } from './delivery-registry-staging-page.mts'
