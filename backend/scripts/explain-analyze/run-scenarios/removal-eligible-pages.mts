import { write } from '@data-stores/psql'
import {
  encodeScopedPreciseTimestampCursor,
  encodeScopedTierPreciseUuidCursor,
} from '@modules/pagination'
import { listUserRemovedPosts } from '@services/communities/publications/list-user-removed'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { contentHash, seedUuid } from '../seed-data/common.mts'

const SIZE = 512
const PREFIX = 384
const PAGE_SIZE = 25
const LOOKAHEAD = PAGE_SIZE + 1
const removedAt = (index: number) =>
  new Date(Date.UTC(2026, 5, 1) - index * 1_000).toISOString().replace('Z', '000Z')

/** Both event streams exclude the deleted prefix before choosing a final eligible page. */
export async function runRemovalEligiblePageScenarios(): Promise<void> {
  const userId = seedUuid(0, 'd6')
  const communityId = seedUuid(0, 'd7')
  const postIds = Array.from({ length: SIZE }, (_, index) => seedUuid(index, 'd5'))
  await write(
    `/* seedRemovalEligibleUser */ INSERT INTO users (id, username)
    VALUES ($1, 'explain-removal-eligible') ON CONFLICT DO NOTHING`,
    [userId],
  )
  await write(
    `/* seedRemovalEligibleCommunity */ INSERT INTO communities
    (id, name, slug, created_by_id, created_via)
    VALUES ($1, 'Explain removal eligible', 'explain-removal-eligible', $2, 'system')
    ON CONFLICT DO NOTHING`,
    [communityId, userId],
  )
  const hash = contentHash('removal-eligible-pages')
  await write(
    `/* seedRemovalEligiblePosts */ INSERT INTO posts
      (id, created_via, post_type, title, markdown, created_by_id, community_id,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256,
       deleted_at, rejected_at)
    SELECT id, 'system', 'discussion', 'Removal eligible ' || ordinal, 'Removed twice', $2, $3, $4, $4,
      CASE WHEN ordinal <= $5 THEN CURRENT_TIMESTAMP END,
      $6::timestamptz - make_interval(secs => (ordinal - 1)::double precision)
    FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, ordinal)
    ON CONFLICT DO NOTHING`,
    [postIds, userId, communityId, hash, PREFIX, removedAt(0)],
  )
  await write(
    `/* seedRemovalEligibleReviews */ INSERT INTO community_post_reviews
      (community_id, post_id, submitted_by_id, unpublished_at)
    SELECT $1, id, $2, $4::timestamptz - make_interval(secs => (ordinal - 1)::double precision)
    FROM unnest($3::uuid[]) WITH ORDINALITY AS input(id, ordinal)
    ON CONFLICT DO NOTHING`,
    [communityId, userId, postIds, removedAt(0)],
  )
  // Plain ANALYZE leaves relallvisible at 0 on the rows just inserted. The ordered index-only
  // scan of idx_posts__created_by_rejected_at_id then loses a close cost comparison to a bitmap
  // heap scan plus Sort (merge group 42706544470 read the whole later-page tail). VACUUM marks
  // those pages all-visible so the index-only plan stays cheaper than the bitmap.
  await write(
    '/* vacuumRemovalEligiblePages */ VACUUM (ANALYZE) users, communities, posts, community_post_reviews',
  )
  try {
    for (const includePlatform of [false, true]) {
      for (const later of [false, true]) {
        const scenarioId = `removal-events-deleted-prefix-${includePlatform ? 'combined' : 'community'}-${later ? 'later' : 'first'}`
        const reviewReads = (later ? 0 : PREFIX) + LOOKAHEAD
        registerScenarioContract(scenarioId, {
          expectations: [
            { kind: 'usesIndexes', indexes: ['idx_comm_post_reviews__user_removed'] },
            { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: reviewReads },
            {
              kind: 'maxProcessedRows',
              relation: 'posts',
              max: reviewReads + LOOKAHEAD * (includePlatform ? 2 : 1),
            },
          ],
          crossPartition: {
            posts: 'Removal event eligibility and hydration look up posts across id partitions.',
          },
        })
        const cursorIndex = PREFIX + PAGE_SIZE - 1
        const after = !later
          ? undefined
          : includePlatform
            ? encodeScopedTierPreciseUuidCursor(
                removedAt(cursorIndex),
                0,
                postIds[cursorIndex]!,
                `user-removed-posts:${userId}:removed-desc-kind-desc-post-desc:v2`,
              )
            : encodeScopedPreciseTimestampCursor(
                removedAt(cursorIndex),
                postIds[cursorIndex]!,
                `user-removed-community-posts:${userId}:unpublished-desc-post-id-desc`,
              )
        // no-mistakes-disable-next-line query-reached-per-item: four fixed community/combined first/later scenarios require separate serialized query captures and plan gates
        await runAndCapture(scenarioId, () =>
          listUserRemovedPosts(userId, { limit: PAGE_SIZE, includePlatform, after }),
        )
      }
    }
  } finally {
    await write('/* deleteRemovalEligiblePosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])', [
      postIds,
    ])
    await write('/* deleteRemovalEligibleCommunity */ DELETE FROM communities WHERE id = $1', [
      communityId,
    ])
    await write('/* deleteRemovalEligibleUser */ DELETE FROM users WHERE id = $1', [userId])
  }
}
