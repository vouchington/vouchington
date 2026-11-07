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
  await write(
    '/* analyzeRemovalEligiblePages */ ANALYZE users, communities, posts, community_post_reviews',
  )
  try {
    for (const includePlatform of [false, true]) {
      for (const later of [false, true]) {
        const scenarioId = `removal-events-deleted-prefix-${includePlatform ? 'combined' : 'community'}-${later ? 'later' : 'first'}`
        registerScenarioContract(scenarioId, {
          // The legal plain join can hash the eligible author cohort before sorting;
          // this budget includes the rejected prefix, both event streams, and final hydration.
          expectations: [
            { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: SIZE * 3 },
            { kind: 'maxProcessedRows', relation: 'posts', max: SIZE * 4 },
          ],
          crossPartition: {
            posts: 'Removal event eligibility and hydration look up posts across id partitions.',
          },
        })
        const cursorIndex = PREFIX + 24
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
        await runAndCapture(scenarioId, () =>
          listUserRemovedPosts(userId, { limit: 25, includePlatform, after }),
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
