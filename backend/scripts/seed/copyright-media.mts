import type { CopyrightSeedContext } from './copyright-context.mts'
import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { ensureImagePlacementBinding } from '@services/media-delivery-safety'
import sql from 'sql-template-strings'

export type CopyrightSeedMedia = { postId: string; imageId: string; hostedUseUrl: string }

// Zero digests mark the post as already analysed so the local workers leave it alone.
const PROCESSED_SHA256 = Buffer.alloc(32)

/**
 * A hosted post with one completed image, owned by `posterId`. Copyright notices need a live
 * post-image placement to target, and the placement resolver rejects anything less.
 */
export async function seedCopyrightMedia(
  posterId: string,
  { identity, now }: CopyrightSeedContext,
): Promise<CopyrightSeedMedia> {
  const { postId, imageId, placementId, namespace } = identity
  const postSlug = `${namespace}-hosted-photo`
  // Raw insert rather than an upload: a real upload needs S3 and the resize pipeline.
  const imageSha256 = createHash('sha256').update(`voucha-${namespace}-image`).digest()
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightMedia:image */
    INSERT INTO images (
      id, created_by_id, sha_256, upload_started_at, upload_completed_at, data, s3_key,
      openai_omni_moderation_results, is_flagged_by_openai_omni_moderation,
      openai_omni_moderation_created_at
    ) VALUES (
      ${imageId}, ${posterId}, ${imageSha256}, ${now}, ${now}, '{}', ${`dev-seed/${imageId}`},
      '[]'::jsonb, false, ${now}
    ) ON CONFLICT DO NOTHING
  `)
  await transaction(sql`/* seedCopyrightMedia:post */
    INSERT INTO posts (
      id, post_type, title, markdown, created_by_id, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    ) VALUES (
      ${postId}, 'discussion', 'Sunrise over the harbour', 'A hosted photograph for copyright review.',
      ${posterId}, 'system', ${PROCESSED_SHA256}, ${PROCESSED_SHA256}
    ) ON CONFLICT DO NOTHING
  `)
  await transaction(sql`/* seedCopyrightMedia:slug */
    INSERT INTO post_slugs (post_id, slug) VALUES (${postId}, ${postSlug}) ON CONFLICT DO NOTHING
  `)
  await transaction(sql`/* seedCopyrightMedia:approve */
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, metadata)
      SELECT id, 'approve', '{"source":"dev-seed"}'::jsonb FROM posts
      WHERE id = ${postId} AND approved_at IS NULL
      RETURNING id, post_id, created_at
    )
    UPDATE posts SET latest_clearance_change_id = inserted_change.id,
      approved_at = inserted_change.created_at, rejected_at = NULL, in_review_at = NULL
    FROM inserted_change WHERE posts.id = inserted_change.post_id
  `)
  const { rowCount: bound } = await transaction(sql`/* seedCopyrightMedia:binding */
    SELECT placement_id FROM image_placements WHERE post_id = ${postId} AND image_id = ${imageId}
  `)
  if (!bound) {
    await ensureImagePlacementBinding(transaction, {
      placementId: placementId,
      imageId: imageId,
      bindingFamily: 'post',
    })
    await transaction(sql`/* seedCopyrightMedia:placement */
      WITH post_image AS (
        INSERT INTO post_images (post_id, image_id, order_index, caption)
        VALUES (${postId}, ${imageId}, 0, 'Sunrise over the harbour')
        RETURNING post_id, image_id
      ), registered AS (
        INSERT INTO media_placements (id) VALUES (${placementId}) RETURNING id
      )
      INSERT INTO image_placements (placement_id, post_id, image_id)
      SELECT registered.id, post_image.post_id, post_image.image_id
      FROM post_image CROSS JOIN registered
    `)
  }
  await transaction.commit()
  return {
    postId: postId,
    imageId: imageId,
    // Claimant-supplied text: a form notice stores the server-resolved URL, and a fixed value
    // keeps the form's request hash identical on every run whatever SITEMAP_BASE_URL says.
    hostedUseUrl: `https://voucha.ai/discussion/${postSlug}`,
  }
}
