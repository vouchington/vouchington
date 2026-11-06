import { write } from '@data-stores/psql'
import { seedComments } from './comments-and-recently-viewed.mts'
import { contentHash, postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const SPINE_LENGTH = 435
const LEAF_COUNT = 500
export const COMMENT_DESCENDANT_DEPTH_ROOT_ID = seedUuidAtTimestamp(
  postSeedTimestampMs(0) + 240_000,
  9_800_000,
)
const SPINE_START_MS = postSeedTimestampMs(0) + 241_000
const SPINE_SERIAL_START = 9_900_000
const LEAF_SERIAL_START = 10_000_000

export async function seedCommentsAndDescendantDepth(): Promise<void> {
  await seedComments()
  await seedCommentDescendantDepth()
}

/** A long chain with late breadth makes an unbounded recursive walk visible in the plan. */
export async function seedCommentDescendantDepth(): Promise<void> {
  const rootId = COMMENT_DESCENDANT_DEPTH_ROOT_ID
  const hash = contentHash('comment-descendant-depth')
  await write(
    `/* seedCommentDescendantDepth:root */ INSERT INTO posts (
      id, post_type, created_via, markdown, created_by_id, approved_at,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
    ) VALUES ($1, 'discussion', 'system', 'seed', $2, now(), $3, $3)
    ON CONFLICT DO NOTHING`,
    [rootId, seedUuid(0, '01'), hash],
  )
  const ids = Array.from({ length: SPINE_LENGTH }, (_, index) =>
    seedUuidAtTimestamp(SPINE_START_MS + index * 1000, SPINE_SERIAL_START + index),
  )
  const parentIds = ids.map((_, index) => (index === 0 ? rootId : ids[index - 1]))
  await write(
    `/* seedCommentDescendantDepth:spine */ INSERT INTO posts (
      id, post_type, created_via, markdown, parent_post_id, root_post_id,
      approved_at, bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256
    )
    SELECT chain.id, 'comment', 'system', 'seed', chain.parent_id, $3,
      now(), $4, $4
    FROM UNNEST($1::uuid[], $2::uuid[]) AS chain(id, parent_id)
    ON CONFLICT DO NOTHING`,
    [ids, parentIds, rootId, hash],
  )

  const leafIds = Array.from({ length: LEAF_COUNT }, (_, index) =>
    seedUuidAtTimestamp(SPINE_START_MS + SPINE_LENGTH * 1000, LEAF_SERIAL_START + index),
  )
  await write(
    `/* seedCommentDescendantDepth:leaves */ INSERT INTO posts (
      id, post_type, created_via, markdown, parent_post_id, root_post_id,
      approved_at, bedrock_nova_multimodal_v1_content_sha256,
      llm_moderation_content_sha256
    )
    SELECT leaf.id, 'comment', 'system', 'seed', $2, $3,
      now(), $4, $4
    FROM UNNEST($1::uuid[]) AS leaf(id)
    ON CONFLICT DO NOTHING`,
    [leafIds, ids.at(-1), rootId, hash],
  )
}
