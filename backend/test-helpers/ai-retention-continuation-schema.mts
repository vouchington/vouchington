import { v7 } from 'uuid'
import type { TransactionQuery } from '@data-stores/psql'
import {
  insertAgedMediaDeliveryTransitionForTest,
  setMediaDeliveryDesiredStateForTest,
} from './entities/media-delivery-retention.mts'

/** Retained legal rows cannot be deleted for cleanup, so none escape the supplied transaction. */
export async function insertRetentionMediaFixture(query: TransactionQuery, old: Date, now: Date) {
  const uploaderId = v7()
  const imageId = v7()
  const placementId = v7()
  await query(
    `/* insertRetentionMediaUploader */
    INSERT INTO retained_user_identities (id) VALUES ($1)`,
    [uploaderId],
  )
  await query(
    `/* insertRetentionMediaImage */
    INSERT INTO retained_image_identities (id, created_by_id) VALUES ($1, $2)`,
    [imageId, uploaderId],
  )
  await query(
    `/* insertRetentionMediaBinding */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    VALUES ($1, $2, 'surface')`,
    [placementId, imageId],
  )
  await query(
    `/* insertRetentionMediaPlacement */
    INSERT INTO media_placements (id) VALUES ($1)`,
    [placementId],
  )
  const { rows } = await query<{ id: string; generation: string }>(
    `/* insertRetentionMediaRecord */
    INSERT INTO media_delivery_registry_records (placement_id, placement_revision, image_id, desired_state)
    VALUES ($1, 0, $2, 'allow') RETURNING id, generation::text`,
    [placementId, imageId],
  )
  const record = rows[0]!
  const first = await insertAgedMediaDeliveryTransitionForTest(
    record.id,
    record.generation,
    'allow',
    old,
    old,
    query,
  )
  const withheld = await setMediaDeliveryDesiredStateForTest(record.id, 'withheld', query)
  const kept = await insertAgedMediaDeliveryTransitionForTest(
    record.id,
    withheld,
    'withheld',
    old,
    old,
    query,
  )
  const allowed = await setMediaDeliveryDesiredStateForTest(record.id, 'allow', query)
  const last = await insertAgedMediaDeliveryTransitionForTest(
    record.id,
    allowed,
    'allow',
    old,
    old,
    query,
  )
  const recent = await insertAgedMediaDeliveryTransitionForTest(
    record.id,
    allowed,
    'allow',
    old,
    now,
    query,
  )
  return [first, kept, last, recent]
}
