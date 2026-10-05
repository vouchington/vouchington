import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { ensureImagePlacementBinding } from '@services/media-delivery-safety'
import sql from 'sql-template-strings'

export type CopyrightSeedMedia = { postId: string; imageId: string; hostedUseUrl: string }

// Fixed UUIDv7s keep every run on the same rows, so reseeding never mints a second hosted image.
const POST_ID = '019c64e6-f720-7c01-a001-000000000001'
const IMAGE_ID = '019c64e6-f720-7c01-a002-000000000001'
const PLACEMENT_ID = '019c64e6-f720-7c01-a003-000000000001'
const POST_SLUG = 'dev-seed-copyright-hosted-photo'
// Raw insert rather than an upload: a real upload needs S3 and the resize pipeline.
const IMAGE_SHA256 = createHash('sha256').update('voucha-dev-seed-copyright-image').digest()
// Zero digests mark the post as already analysed so the local workers leave it alone.
const PROCESSED_SHA256 = Buffer.alloc(32)

/**
 * A hosted post with one completed image, owned by `posterId`. Copyright notices need a live
 * post-image placement to target, and the placement resolver rejects anything less.
 */
export async function seedCopyrightMedia(posterId: string): Promise<CopyrightSeedMedia> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightMedia:image */
    INSERT INTO images (
      id, created_by_id, sha_256, upload_started_at, upload_completed_at, data, s3_key,
      openai_omni_moderation_results, is_flagged_by_openai_omni_moderation,
      openai_omni_moderation_created_at
    ) VALUES (
      ${IMAGE_ID}, ${posterId}, ${IMAGE_SHA256}, NOW(), NOW(), '{}', ${`dev-seed/${IMAGE_ID}`},
      '[]'::jsonb, false, NOW()
    ) ON CONFLICT DO NOTHING
  `)
  await transaction(sql`/* seedCopyrightMedia:post */
    INSERT INTO posts (
      id, post_type, title, markdown, created_by_id, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    ) VALUES (
      ${POST_ID}, 'discussion', 'Sunrise over the harbour', 'A hosted photograph for copyright review.',
      ${posterId}, 'system', ${PROCESSED_SHA256}, ${PROCESSED_SHA256}
    ) ON CONFLICT DO NOTHING
  `)
  await transaction(sql`/* seedCopyrightMedia:slug */
    INSERT INTO post_slugs (post_id, slug) VALUES (${POST_ID}, ${POST_SLUG}) ON CONFLICT DO NOTHING
  `)
  await transaction(sql`/* seedCopyrightMedia:approve */
    WITH inserted_change AS (
      INSERT INTO post_clearance_changes (post_id, change_type, metadata)
      SELECT id, 'approve', '{"source":"dev-seed"}'::jsonb FROM posts
      WHERE id = ${POST_ID} AND approved_at IS NULL
      RETURNING id, post_id, created_at
    )
    UPDATE posts SET latest_clearance_change_id = inserted_change.id,
      approved_at = inserted_change.created_at, rejected_at = NULL, in_review_at = NULL
    FROM inserted_change WHERE posts.id = inserted_change.post_id
  `)
  const { rowCount: bound } = await transaction(sql`/* seedCopyrightMedia:binding */
    SELECT placement_id FROM image_placements WHERE post_id = ${POST_ID} AND image_id = ${IMAGE_ID}
  `)
  if (!bound) {
    await ensureImagePlacementBinding(transaction, {
      placementId: PLACEMENT_ID,
      imageId: IMAGE_ID,
      bindingFamily: 'post',
    })
    await transaction(sql`/* seedCopyrightMedia:placement */
      WITH post_image AS (
        INSERT INTO post_images (post_id, image_id, order_index, caption)
        VALUES (${POST_ID}, ${IMAGE_ID}, 0, 'Sunrise over the harbour')
        RETURNING post_id, image_id
      ), registered AS (
        INSERT INTO media_placements (id) VALUES (${PLACEMENT_ID}) RETURNING id
      )
      INSERT INTO image_placements (placement_id, post_id, image_id)
      SELECT registered.id, post_image.post_id, post_image.image_id
      FROM post_image CROSS JOIN registered
    `)
  }
  await transaction.commit()
  return {
    postId: POST_ID,
    imageId: IMAGE_ID,
    // Claimant-supplied text: a form notice stores the server-resolved URL, and a fixed value
    // keeps the form's request hash identical on every run whatever SITEMAP_BASE_URL says.
    hostedUseUrl: `https://voucha.ai/discussion/${POST_SLUG}`,
  }
}
