import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  beginTransaction,
  write,
  type QueryExecutor,
  type TransactionQuery,
} from '@data-stores/psql'
import { validatePostImageInputs } from '@services/posts/image-input-validation'
import { applyPostTransactionSideEffects } from '@services/posts/create/transaction-side-effects'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { seedUser } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'

type FixtureImage = { image_id: string; order_index: number; caption: string }

export async function seedPostImageWriteFixture(pageSize: number) {
  const fixtureId = randomUUID()
  const replacementCount = Math.floor(pageSize / 2)
  const { rows } = await write<{ id: string }>(
    `/* seedPostImageWriteFixture */
     INSERT INTO images (
       created_by_id, data, sha_256, s3_key, upload_started_at, upload_completed_at,
       openai_omni_moderation_results, is_flagged_by_openai_omni_moderation,
       openai_omni_moderation_created_at
     )
     SELECT $1, '{"width":100,"height":100}', content_hash, encode(content_hash, 'hex'),
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '[]', false, CURRENT_TIMESTAMP
     FROM unnest($2::bytea[]) AS image(content_hash)
     RETURNING id`,
    [
      seedUser.id,
      Array.from({ length: pageSize + replacementCount }, (_, index) =>
        contentHash(`post-image-write-${fixtureId}-${index}`),
      ),
    ],
  )
  const imageInputs = (ids: readonly string[], version: string): FixtureImage[] =>
    ids.map((image_id, order_index) => ({
      image_id,
      order_index,
      caption: `${version} ${order_index}`,
    }))
  const ids = rows.map(row => row.id).toSorted()
  const original = imageInputs(ids.slice(0, pageSize), 'Original')
  // Keep half of the existing attachments, reorder them, and introduce half new assets.
  const replacement = imageInputs(
    [...ids.slice(pageSize), ...ids.slice(replacementCount, pageSize).toReversed()],
    'Replacement',
  )
  assert.equal(original.length, pageSize)
  assert.equal(replacement.length, pageSize)
  const postId = await insertTestPost({
    title: 'EXPLAIN post image writes',
    slug: `explain-post-image-${fixtureId}`,
    createdById: seedUser.id,
    markdown: 'Image capacity fixture',
    clearanceStatus: 'pending',
  })
  return { postId, original, replacement }
}

export async function writeCreatedPostImages(
  postId: string,
  images: FixtureImage[],
  query: TransactionQuery,
): Promise<void> {
  await validatePostImageInputs(images, seedUser.id, false)
  await applyPostTransactionSideEffects({
    creator: seedUser,
    options: { query },
    post: { id: postId, title: 'EXPLAIN post image writes' },
    postType: 'discussion',
    updates: { images },
  })
}

export async function readPostImageRows(postId: string, query: QueryExecutor = write) {
  const { rows } = await query<FixtureImage>(
    `/* readPostImageWriteRows */
     SELECT image_id, order_index, caption FROM post_images WHERE post_id = $1 ORDER BY order_index`,
    [postId],
  )
  return rows
}

export async function resetPostImageRows(
  postId: string,
  images: readonly FixtureImage[],
): Promise<void> {
  await using query = await beginTransaction()
  await query('/* resetPostImageWriteRows:delete */ DELETE FROM post_images WHERE post_id = $1', [
    postId,
  ])
  if (images.length > 0) {
    await query(
      `/* resetPostImageWriteRows:insert */
       INSERT INTO post_images (post_id, image_id, order_index, caption)
       SELECT $1, input.image_id, input.order_index, input.caption
       FROM jsonb_to_recordset($2::jsonb) AS input(image_id uuid, order_index integer, caption text)`,
      [postId, JSON.stringify(images)],
    )
  }
  await query.commit()
}
