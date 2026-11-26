import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { heavyFollowUser, seedUser } from '../run-support.mts'
import { seedCommunityAgentModerationCapacity } from './community-publication-agent-fixture.mts'
import { seedCommunityBanReportCapacity } from './community-publication-ban-fixture.mts'

type Report = { id: string; community_id: string; post_id: string }
const backgroundCommunities = 12

export async function seedCommunityPublicationCapacity() {
  const prefix = `explain-community-publication-${randomUUID()}`
  await using query = await beginTransaction()
  const { rows: communities } = await query<{ id: string; slug: string }>(sql`
    /* seedCommunityPublicationCapacity:communities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT 'Explain publication capacity ' || n, ${prefix}::text || '-' || n,
      ${seedUser.id}, 'system'
    FROM generate_series(0, ${backgroundCommunities}::int) AS fixture(n)
    RETURNING id, slug
  `)
  const communityId = communities.find(row => row.slug === `${prefix}-0`)!.id
  const communityIds = [
    communityId,
    ...communities.filter(row => row.id !== communityId).map(row => row.id),
  ]

  const { rows: posts } = await query<{ id: string; community_id: string }>(sql`
    /* seedCommunityPublicationCapacity:posts */
    INSERT INTO posts
      (id, community_id, created_by_id, post_type, title, markdown, created_via, approved_at, broadcast, privacy,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT uuidv7(-n * interval '1 minute'), community_id, ${seedUser.id},
      'discussion', 'Publication fixture', 'Publication fixture', 'system', CURRENT_TIMESTAMP, 'everyone', 'public',
      decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
    FROM unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN ordinal = 1 THEN 200 ELSE 128 END) AS fixture(n)
    ORDER BY n, ordinal
    RETURNING id, community_id
  `)
  const postIds = posts.map(row => row.id)
  const targetPostIds = posts
    .filter(row => row.community_id === communityId)
    .map(row => row.id)
    .toSorted()
  const pinnedIds = targetPostIds.slice(0, 3)
  const agentPostId = targetPostIds[3]!

  await query(sql`
    /* seedCommunityPublicationCapacity:pins */
    WITH approved AS (
      INSERT INTO community_post_reviews (community_id, post_id, submitted_by_id, reviewed_at, approved_at)
      SELECT community_id, id, ${seedUser.id}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM posts WHERE id = ANY(${postIds}::uuid[])
      RETURNING community_id, post_id
    ), ranked AS (
      SELECT community_id, post_id, row_number() OVER (PARTITION BY community_id ORDER BY post_id) - 1 AS rank
      FROM approved
    )
    INSERT INTO community_pinned_posts (community_id, post_id, pinned_by_id, order_index)
    SELECT community_id, post_id, ${seedUser.id}, rank
    FROM ranked WHERE rank < 3
  `)
  // A retired pin in a different community still occupies a valid pin slot.
  await query(sql`
    /* seedCommunityPublicationCapacity:retiredPin */
    UPDATE community_post_reviews SET unpublished_at = CURRENT_TIMESTAMP
    WHERE post_id IN (
      SELECT post_id FROM community_pinned_posts
      WHERE community_id = ANY(${communityIds.slice(1)}::uuid[]) AND order_index = 2
    )
  `)

  const { rows: backgroundPins } = await query<{ community_id: string; post_id: string }>(sql`
    /* seedCommunityPublicationCapacity:backgroundPins */
    INSERT INTO community_pinned_posts (community_id, post_id, pinned_by_id, order_index)
    SELECT eligible.community_id, eligible.post_id, ${seedUser.id}, 0
    FROM (
      SELECT DISTINCT ON (r.community_id) r.community_id, r.post_id
      FROM community_post_reviews r JOIN posts p ON p.id = r.post_id AND p.community_id = r.community_id
      WHERE r.approved_at IS NOT NULL AND r.rejected_at IS NULL AND p.approved_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM community_pinned_posts cpp WHERE cpp.community_id = r.community_id)
      ORDER BY r.community_id, r.post_id
      LIMIT 1000
    ) AS eligible
    RETURNING community_id, post_id
  `)
  const { rows: reports } = await query<Report>(sql`
    /* seedCommunityPublicationCapacity:reports */
    WITH cases AS (
      INSERT INTO moderation_cases (post_id)
      SELECT id FROM posts WHERE id = ANY(${postIds}::uuid[]) AND id <> ALL(${pinnedIds}::uuid[])
      RETURNING id, post_id
    )
    INSERT INTO moderation_reports (id, community_id, post_id, case_id, reporter_user_id, reason, original_reason, created_via)
    SELECT uuidv7(uuid_extract_timestamp(p.id) - CURRENT_TIMESTAMP), p.community_id, p.id,
      cases.id, ${heavyFollowUser.id}, 'spam', 'spam', 'system'
    FROM cases JOIN posts p ON p.id = cases.post_id
    RETURNING id, community_id, post_id
  `)
  const targetReports = reports
    .filter(row => row.community_id === communityId)
    .toSorted((a, b) => a.id.localeCompare(b.id))
  const severeReports = targetReports.slice(0, 100)
  await query(sql`
    /* seedCommunityPublicationCapacity:judgements */
    INSERT INTO moderation_report_judgements
      (post_id, triggering_report_id, recommended_action, public_response, internal_response, model)
    SELECT post_id, report_id,
      CASE WHEN n = 100 THEN 'warn'::moderation_judgement_actions ELSE 'remove'::moderation_judgement_actions END,
      'Fixture finding', 'Fixture finding', 'fixture'
    FROM unnest(${severeReports.map(row => row.post_id)}::uuid[], ${severeReports.map(row => row.id)}::uuid[])
      WITH ORDINALITY AS fixture(post_id, report_id, n)
  `)

  const { banReports, caseIds, memberCount } = await seedCommunityBanReportCapacity(
    query,
    communityIds,
  )

  const otherPostIds = posts
    .filter(row => row.community_id !== communityId)
    .slice(0, 500)
    .map(row => row.id)
  const { moderationIds, moderationCount, promptIds } = await seedCommunityAgentModerationCapacity(
    query,
    communityId,
    communityIds[1]!,
    agentPostId,
    [agentPostId, ...targetPostIds.slice(4), ...otherPostIds],
  )
  await query.commit()

  const targetBanIds = banReports.filter(row => row.community_id === communityId).map(row => row.id)
  const rankedReportIds = severeReports
    .slice(0, 99)
    .map(row => row.id)
    .toReversed()
  rankedReportIds.push(severeReports[99]!.id)
  rankedReportIds.push(
    ...[...targetReports.slice(100).map(row => row.id), ...targetBanIds].toSorted().toReversed(),
  )
  return {
    communityId,
    otherCommunityId: communityIds[1]!,
    posts,
    reports,
    pinnedIds,
    agentPostId,
    rankedReportIds,
    timeReportIds: [...targetReports.map(row => row.id), ...targetBanIds].toSorted().toReversed(),
    moderationIds,
    seededRows: {
      posts: posts.length,
      moderation_reports: reports.length + banReports.length,
      moderation_report_judgements: severeReports.length,
      community_post_reviews: posts.length,
      community_members: memberCount,
      agent_moderations: moderationCount,
      community_pinned_posts: communityIds.length * 3 + backgroundPins.length,
    },
    async cleanup() {
      await using cleanup = await beginTransaction()
      await cleanup(sql`/* cleanupCommunityPublicationCapacity:backgroundPins */
        DELETE FROM community_pinned_posts
        WHERE (community_id, post_id) IN (
          SELECT community_id, post_id FROM unnest(
            ${backgroundPins.map(row => row.community_id)}::uuid[], ${backgroundPins.map(row => row.post_id)}::uuid[]
          ) AS fixture(community_id, post_id)
        )`)
      await cleanup(sql`/* cleanupCommunityPublicationCapacity:posts */
        DELETE FROM posts WHERE id = ANY(${postIds}::uuid[])`)
      await cleanup(sql`/* cleanupCommunityPublicationCapacity:userCases */
        DELETE FROM moderation_cases WHERE id = ANY(${caseIds}::uuid[])`)
      await cleanup(sql`/* cleanupCommunityPublicationCapacity:prompts */
        DELETE FROM agent_prompts WHERE id = ANY(${promptIds}::uuid[])`)
      await cleanup(sql`/* cleanupCommunityPublicationCapacity:communities */
        DELETE FROM communities WHERE id = ANY(${communityIds}::uuid[])`)
      await cleanup.commit()
    },
  }
}
