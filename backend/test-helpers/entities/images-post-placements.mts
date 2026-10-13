import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { createHash } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { ensureImagePlacementBinding } from '../../services/media-delivery-safety/retained-image-identities.mts'

export async function insertTestPostImage(data: {
  placementId?: string
  postId: string
  imageId: string
  orderIndex?: number
  caption?: string
}): Promise<string> {
  const { rows: existing } = await read<{ placement_id: string }>(sql`/* findTestPostImageBinding */
    SELECT placement_id FROM image_placements
    WHERE post_id = ${data.postId} AND image_id = ${data.imageId}
  `)
  if (existing[0]) return existing[0].placement_id
  const placementId = data.placementId ?? v7()
  await using query = await beginTransaction()
  await ensureImagePlacementBinding(query, {
    placementId,
    imageId: data.imageId,
    bindingFamily: 'post',
  })
  await query(
    allowUnannotatedQuery(sql`
    WITH inserted_post_image AS (
      INSERT INTO post_images (post_id, image_id, order_index, caption)
      VALUES (${data.postId}, ${data.imageId}, ${data.orderIndex ?? 0}, ${data.caption ?? ''})
      RETURNING post_id, image_id
    ), missing_binding AS (
      SELECT ${placementId}::uuid AS placement_id, post_id, image_id
      FROM inserted_post_image
      WHERE NOT EXISTS (
        SELECT 1 FROM image_placements
        WHERE post_id = inserted_post_image.post_id AND image_id = inserted_post_image.image_id
      )
    ), registered AS (
      INSERT INTO media_placements (id)
      SELECT placement_id FROM missing_binding
      RETURNING id
    )
    INSERT INTO image_placements (placement_id, post_id, image_id)
    SELECT placement_id, post_id, image_id FROM missing_binding
  `),
  )
  await query.commit()
  return placementId
}

export async function insertPendingTestImage(userId: string): Promise<string> {
  const imageId = v7()
  const tempHash = createHash('sha256').update(imageId).digest()
  const { rows } = await write(
    allowUnannotatedQuery(sql`
    INSERT INTO images (id, created_by_id, sha_256, data, s3_key)
    VALUES (${imageId}, ${userId}, ${tempHash}, '{}', ${imageId})
    RETURNING id
  `),
  )
  return rows[0].id
}
