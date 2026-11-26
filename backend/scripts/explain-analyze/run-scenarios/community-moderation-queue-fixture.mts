import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { heavyFollowUser, seedUser } from '../run-support.mts'

const backgroundCommunities = 16
const targetPosts = 2800
const backgroundPostsPerCommunity = 192

type QueueRow = {
  id: string
  created_at: Date
  source: 'report' | 'community_review'
}

export async function seedCommunityModerationQueue() {
  const slugPrefix = `explain-moderation-queue-${randomUUID()}`
  await using transaction = await beginTransaction()
  const { rows: communities } = await transaction<{ slug: string; id: string }>(sql`
    /* seedCommunityModerationQueue:communities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT 'Explain moderation queue ' || n, ${slugPrefix}::text || '-' || n, ${seedUser.id}, 'system'
    FROM generate_series(0, ${backgroundCommunities}::int) AS fixture(n)
    RETURNING slug, id
  `)
  const communityId = communities.find(row => row.slug === `${slugPrefix}-0`)!.id
  const otherCommunityIds = communities.filter(row => row.id !== communityId).map(row => row.id)
  const communityIds = [communityId, ...otherCommunityIds]

  const { rows: posts } = await transaction<{ id: string }>(sql`
    /* seedCommunityModerationQueue:posts */
    INSERT INTO posts
      (id, community_id, created_by_id, post_type, title, markdown, created_via,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT uuidv7(-n * interval '1 minute'), community_id, ${seedUser.id}, 'discussion',
      'Moderation queue fixture', 'Moderation queue fixture', 'system',
      decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
    FROM unnest(${communityIds}::uuid[])
      WITH ORDINALITY AS community(community_id, ordinal)
    CROSS JOIN LATERAL generate_series(
      1, CASE WHEN ordinal = 1 THEN ${targetPosts}::int ELSE ${backgroundPostsPerCommunity}::int END
    ) AS fixture(n)
    ORDER BY n, ordinal
    RETURNING id
  `)
  const postIds = posts.map(row => row.id)
  const { rows: reviews } = await transaction<{
    id: string
    community_id: string
    created_at: Date
    approved_at: Date | null
  }>(sql`
    /* seedCommunityModerationQueue:reviews */
    INSERT INTO community_post_reviews
      (community_id, post_id, submitted_by_id, created_at, reviewed_at, approved_at)
    SELECT community_id, post_id, ${seedUser.id}, uuid_extract_timestamp(post_id),
      CASE WHEN n % 2 = 0 THEN uuid_extract_timestamp(post_id) END,
      CASE WHEN n % 2 = 0 THEN uuid_extract_timestamp(post_id) END
    FROM (
      SELECT id AS post_id, community_id,
        row_number() OVER (PARTITION BY community_id ORDER BY id) AS n
      FROM posts WHERE id = ANY(${postIds}::uuid[])
    ) AS fixture
    RETURNING post_id AS id, community_id, created_at, approved_at
  `)
  const approvedPostIds = reviews
    .filter(row => row.approved_at !== null)
    .map(row => row.id)
    .toSorted()
  const { rows: reports } = await transaction<{
    id: string
    community_id: string
    created_at: Date
    reviewed_at: Date | null
  }>(sql`
    /* seedCommunityModerationQueue:reports */
    WITH cases AS (
      INSERT INTO moderation_cases (post_id)
      SELECT post_id FROM unnest(${approvedPostIds}::uuid[]) AS fixture(post_id)
      RETURNING id, post_id
    )
    INSERT INTO moderation_reports
      (id, created_via, reporter_user_id, post_id, case_id, community_id, reason, original_reason,
       reviewed_at, resolution_action)
    SELECT uuidv7(uuid_extract_timestamp(p.id) - CURRENT_TIMESTAMP + interval '30 seconds'),
      'system', ${heavyFollowUser.id}, p.id, cases.id, p.community_id, 'spam', 'spam',
      CASE WHEN n % 8 = 0 THEN CURRENT_TIMESTAMP END,
      CASE WHEN n % 8 = 0 THEN 'dismissed'::moderation_report_resolution_actions END
    FROM cases
    JOIN unnest(${approvedPostIds}::uuid[]) WITH ORDINALITY AS fixture(post_id, n) USING (post_id)
    JOIN posts p ON p.id = cases.post_id
    RETURNING id, community_id, created_at, reviewed_at
  `)
  await transaction.commit()

  const queue: QueueRow[] = [
    ...reviews
      .filter(row => row.community_id === communityId && row.approved_at === null)
      .map(({ id, created_at }) => ({ id, created_at, source: 'community_review' as const })),
    ...reports
      .filter(row => row.community_id === communityId && row.reviewed_at === null)
      .map(({ id, created_at }) => ({ id, created_at, source: 'report' as const })),
  ]
  queue.sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id.localeCompare(a.id))
  return {
    communityId,
    queue,
    seededRows: { posts: posts.length, moderation_reports: reports.length },
    async cleanup() {
      await write(sql`/* cleanupCommunityModerationQueue:posts */
        DELETE FROM posts WHERE id = ANY(${postIds}::uuid[])`)
      await write(sql`/* cleanupCommunityModerationQueue:communities */
        DELETE FROM communities WHERE id = ANY(${communityIds}::uuid[])`)
    },
  }
}
