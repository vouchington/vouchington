import { beginTransaction } from '@data-stores/psql'
import { buildViewerPostDiscoveryEligibilityFilter } from '@modules/feed-query-builders'
import { getProfileCountCap } from '@services/users/profile-count-cap'
import { getTopicsWorkLimit, topicsWorkMaxValues } from '@services/topics/work-limits'
import sql from 'sql-template-strings'
import { postSeedTimestampMs, seedUuid } from './common.mts'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'

const FIXTURE_ID_START = 2_500_000

export const MANY_ALIAS_VIEWER_TOPIC_ID = seedUuid(FIXTURE_ID_START, '04')
const MAX_POSITIVE_ALIAS_COUNT = Math.floor(topicsWorkMaxValues.viewer_count_input_cap / 2)

export function manyAliasViewerInputCounts(): { aliasCount: number; positiveCount: number } {
  const inputCap = getTopicsWorkLimit('viewer_count_input_cap')
  const countCap = getProfileCountCap()
  const positiveCount = Math.max(
    1,
    Math.min(MAX_POSITIVE_ALIAS_COUNT, Math.floor(inputCap / 2), Math.floor(countCap / 2)),
  )
  return { aliasCount: inputCap + 1, positiveCount }
}

export async function seedManyAliasTopicViewerCounts(): Promise<void> {
  const { aliasCount, positiveCount } = manyAliasViewerInputCounts()
  const zeroCount = aliasCount - positiveCount
  const aliasIds = Array.from({ length: aliasCount }, (_, index) =>
    seedUuid(FIXTURE_ID_START + index, 'e3'),
  )
  const aliasNames = [
    ...Array.from(
      { length: positiveCount },
      (_, index) => `a-viewer-positive-${index.toString().padStart(4, '0')}`,
    ),
    ...Array.from(
      { length: zeroCount },
      (_, index) => `z-viewer-empty-${index.toString().padStart(4, '0')}`,
    ),
  ]
  const viewerId = seedUuid(0, '01')
  const eligibility = buildViewerPostDiscoveryEligibilityFilter('candidate_post', 'root_post', {
    currentUserId: viewerId,
    isAdministrator: false,
  })
  // Borrow only anchor-past posts so database-clock relation ids follow their endpoints.
  const eligiblePostsQuery = sql`/* seedManyAliasTopicViewerCounts:eligible-posts */
    SELECT candidate_post.id, candidate_post.created_by_id
    FROM posts candidate_post
    JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
    WHERE candidate_post.post_type = 'discussion'
      AND candidate_post.id < ${getMinUUIDv7ForDate(new Date(postSeedTimestampMs(0)))}::uuid
      AND `
    .append(eligibility)
    .append(sql` ORDER BY candidate_post.id DESC LIMIT ${positiveCount}`)

  await using transaction = await beginTransaction()
  const { rows: eligiblePosts } = await transaction<{ id: string; created_by_id: string }>(
    eligiblePostsQuery,
  )
  if (eligiblePosts.length !== positiveCount)
    throw new Error(
      'Many-alias topic viewer fixture needs enough visible positive discussion posts',
    )

  await transaction(
    `/* seedManyAliasTopicViewerCounts:topic */
     INSERT INTO topics (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     VALUES ($1, 'Many alias viewer count', 'many-alias-viewer-count', 'system', decode(repeat('00', 32), 'hex'))
     ON CONFLICT DO NOTHING`,
    [MANY_ALIAS_VIEWER_TOPIC_ID],
  )
  await transaction(
    `/* seedManyAliasTopicViewerCounts:aliases */
     INSERT INTO topic_aliases (id, topic_id, alias)
     SELECT alias.id, $1::uuid, alias.alias
     FROM UNNEST($2::uuid[], $3::text[]) AS alias(id, alias)
     ON CONFLICT DO NOTHING`,
    [MANY_ALIAS_VIEWER_TOPIC_ID, aliasIds, aliasNames],
  )
  const positiveAliasIds = aliasIds.slice(0, positiveCount)
  const postIds = eligiblePosts.map(post => post.id)
  const creatorIds = eligiblePosts.map(post => post.created_by_id)
  await transaction(
    `/* seedManyAliasTopicViewerCounts:positive-alias-memberships */
     INSERT INTO relation__post__category__topic_alias
       (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
     SELECT membership.post_id, membership.alias_id, membership.created_by_id, 1, 1
     FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[])
       AS membership(post_id, alias_id, created_by_id)
     ON CONFLICT DO NOTHING`,
    [postIds, positiveAliasIds, creatorIds],
  )
  await transaction(
    '/* seedManyAliasTopicViewerCounts:analyze */ ANALYZE topic_aliases, relation__post__category__topic_alias, posts',
  )
  await transaction.commit()
}

/** Remove only identities and memberships owned by this deterministic fixture. */
export async function cleanupManyAliasTopicViewerCounts(): Promise<void> {
  const aliasIds = Array.from(
    { length: topicsWorkMaxValues.viewer_count_input_cap + 1 },
    (_, index) => seedUuid(FIXTURE_ID_START + index, 'e3'),
  )
  await using transaction = await beginTransaction()
  await transaction(
    '/* cleanupManyAliasTopicViewerCounts:memberships */ DELETE FROM relation__post__category__topic_alias WHERE object_id = ANY($1::uuid[])',
    [aliasIds],
  )
  await transaction(
    '/* cleanupManyAliasTopicViewerCounts:aliases */ DELETE FROM topic_aliases WHERE id = ANY($1::uuid[])',
    [aliasIds],
  )
  await transaction(
    '/* cleanupManyAliasTopicViewerCounts:topic */ DELETE FROM topics WHERE id = $1::uuid',
    [MANY_ALIAS_VIEWER_TOPIC_ID],
  )
  await transaction.commit()
}
