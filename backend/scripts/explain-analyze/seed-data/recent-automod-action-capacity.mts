import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'

const TARGET_ROWS = 300
const RECENT_ACTIONS = 225
const CORPUS_ROWS = 1500
const HASH = 'ba'.repeat(32)
const POLICY_REVISION = '2026-09-09.1'

type FixturePost = { id: string; title: string }

export async function seedRecentAutomodActionCapacity() {
  await using query = await beginTransaction()
  const slug = `explain-recent-automod-${randomUUID()}`
  const { rows: communities } = await query<{ id: string; slug: string }>(
    `/* seedRecentAutomodCommunities */
     INSERT INTO communities (name, slug, created_by_id, created_via)
     SELECT 'Explain recent automod', $1 || '-' || n, $2, 'system'
     FROM generate_series(0, 4) n
     RETURNING id, slug`,
    [slug, seedUser.id],
  )
  const communityIds = communities
    .toSorted((a, b) => a.slug.localeCompare(b.slug))
    .map(row => row.id)
  const { rows: posts } = await query<FixturePost>(
    `/* seedRecentAutomodPosts */
     INSERT INTO posts (
       created_via, post_type, title, created_by_id, community_id, rejected_at,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
     )
     SELECT 'system', 'discussion', n::text, $1,
       ($2::uuid[])[CASE WHEN n <= $3 THEN 1 ELSE 2 + n % 4 END],
       date_trunc('milliseconds', CURRENT_TIMESTAMP) -
         CASE WHEN n > $4 AND n <= $4 + 30 THEN INTERVAL '72 hours'
           ELSE INTERVAL '1 hour' + (n % 3) * INTERVAL '1 minute' END,
       decode($5, 'hex'), decode($5, 'hex')
     FROM generate_series(1, $6) n
     RETURNING id, title`,
    [seedUser.id, communityIds, TARGET_ROWS, RECENT_ACTIONS, HASH, CORPUS_ROWS],
  )
  const postIds = posts.toSorted((a, b) => Number(a.title) - Number(b.title)).map(row => row.id)
  await query(
    `/* seedRecentAutomodLedger */
     WITH versions AS (
       INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
       SELECT post_id, decode($2, 'hex'), $3 FROM unnest($1::uuid[]) AS input(post_id)
       RETURNING id, post_id
     )
     INSERT INTO post_moderation_dispositions (version_id, source, disposition, reason_code, evidence)
     SELECT versions.id,
       CASE WHEN n % 2 = 0 THEN 'spam_detection' ELSE 'openai_omni' END::post_moderation_sources,
       CASE WHEN n > $4 + 30 AND n <= $5 THEN 'pass' ELSE 'review' END::post_moderation_disposition_types,
       'explain_fixture', jsonb_build_object('composite_score', (n % 5) / 10.0)
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(post_id, n)
     JOIN versions USING (post_id)`,
    [postIds, HASH, POLICY_REVISION, RECENT_ACTIONS, TARGET_ROWS],
  )
  await query(
    `/* seedRecentAutomodFeedback */
     INSERT INTO moderation_training_feedbacks
       (community_id, post_id, source_type, event_type, label, human_action, input_sha256)
     SELECT p.community_id, p.id,
       CASE WHEN n % 2 = 0 THEN 'spam_detection' ELSE 'openai_omni' END::moderation_training_source_types,
       'automod_reviewed', 'false_positive', 'label_only', decode($2, 'hex')
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(post_id, n)
     JOIN posts p ON p.id = input.post_id
     WHERE n % 11 = 0 AND (n <= $3 OR n > $4)`,
    [postIds, HASH, RECENT_ACTIONS, TARGET_ROWS],
  )
  await query.commit()

  const expectedKeys = postIds
    .slice(0, RECENT_ACTIONS)
    .map((postId, index) => {
      const n = index + 1
      return {
        n,
        key: `${n % 2 === 0 ? 'spam_detection' : 'openai_omni'}:${postId}:${HASH}`,
        confidence: n % 2 === 0 ? n % 5 : Infinity,
      }
    })
    .filter(({ n }) => n % 11 !== 0)
    .toSorted(
      (a, b) => a.confidence - b.confidence || (a.n % 3) - (b.n % 3) || b.key.localeCompare(a.key),
    )
    .map(({ key }) => key)
  const reviewed = Math.floor(RECENT_ACTIONS / 11)
  return {
    communityIds,
    postIds,
    expectedKeys,
    stats: {
      total_count: RECENT_ACTIONS,
      false_positive_count: reviewed,
      false_positive_rate: reviewed / RECENT_ACTIONS,
    },
  }
}

export async function cleanupRecentAutomodActionCapacity(
  communityIds: string[],
  postIds: string[],
) {
  await write('/* cleanupRecentAutomodPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])', [
    postIds,
  ])
  await write(
    '/* cleanupRecentAutomodCommunities */ DELETE FROM communities WHERE id = ANY($1::uuid[])',
    [communityIds],
  )
}
