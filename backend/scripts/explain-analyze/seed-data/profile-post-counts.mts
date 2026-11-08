import { beginTransaction, write } from '@data-stores/psql'
import { contentHash, postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

export const PROFILE_POST_COUNTS_AUTHOR_ID = seedUuid(9_000_000, '01')
export const PROFILE_POST_COUNT_PER_TYPE = 2_000
const POST_SERIAL_START = 20_000_000
const BATCH_SIZE = 500

/** One author's comments exceed the old first-page count while every type stays equally dense. */
export async function seedProfilePostCounts(): Promise<void> {
  const anchorMs = postSeedTimestampMs(0)
  const rootId = seedUuidAtTimestamp(anchorMs, POST_SERIAL_START)
  const hash = contentHash('profile-post-counts')
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedProfilePostCountsAuthor */ INSERT INTO users (id, username)
     VALUES ($1, 'seed-profile-post-counts') ON CONFLICT (id) DO NOTHING`,
    [PROFILE_POST_COUNTS_AUTHOR_ID],
  )
  const postTypes = ['review', 'discussion', 'comment'] as const
  for (const [typeIndex, postType] of postTypes.entries()) {
    for (let start = 0; start < PROFILE_POST_COUNT_PER_TYPE; start += BATCH_SIZE) {
      const ids = Array.from({ length: BATCH_SIZE }, (_, index) => {
        const offset = typeIndex * PROFILE_POST_COUNT_PER_TYPE + start + index
        return seedUuidAtTimestamp(anchorMs + offset, POST_SERIAL_START + offset)
      })
      await transaction(
        `/* seedProfilePostCountsPosts */ INSERT INTO posts (
          id, post_type, created_via, markdown, created_by_id,
          parent_post_id, root_post_id, approved_at,
          bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
        ) SELECT fixture.id, $2::post_types, 'system', 'profile count fixture', $3,
            $4::uuid, $4::uuid, now(), $5, $5
          FROM UNNEST($1::uuid[]) AS fixture(id)
          ON CONFLICT (id) DO NOTHING`,
        [
          ids,
          postType,
          PROFILE_POST_COUNTS_AUTHOR_ID,
          postType === 'comment' ? rootId : null,
          hash,
        ],
      )
    }
  }
  await transaction.commit()
}

/** Remove only this scenario's known posts before later scenarios measure the shared corpus. */
export async function cleanupProfilePostCounts(): Promise<void> {
  const anchorMs = postSeedTimestampMs(0)
  const ids = Array.from({ length: PROFILE_POST_COUNT_PER_TYPE * 3 }, (_, offset) =>
    seedUuidAtTimestamp(anchorMs + offset, POST_SERIAL_START + offset),
  )
  {
    await using transaction = await beginTransaction()
    await transaction(
      `/* cleanupProfilePostCountsComments */ DELETE FROM posts
       WHERE id = ANY($1::uuid[]) AND created_by_id = $2`,
      [ids.slice(PROFILE_POST_COUNT_PER_TYPE * 2), PROFILE_POST_COUNTS_AUTHOR_ID],
    )
    await transaction(
      `/* cleanupProfilePostCountsRoots */ DELETE FROM posts
       WHERE id = ANY($1::uuid[]) AND created_by_id = $2`,
      [ids.slice(0, PROFILE_POST_COUNT_PER_TYPE * 2), PROFILE_POST_COUNTS_AUTHOR_ID],
    )
    await transaction.commit()
  }
  await write('/* analyzeAfterProfilePostCountsCleanup */ ANALYZE posts')
}
