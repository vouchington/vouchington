import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { POST_MODERATION_POLICY_REVISION } from '@voucha/types/entities/post-moderation'
import { seedTopicId, seedUser } from '../run-support.mts'
import { contentHash, postSeedTimestampMs, seedUuidAtTimestamp } from './common.mts'

// Both GET /api/v1/reports shapes accept at most 100 results per page.
export const REPORT_POST_PAGE_CAP = 100
const OTHER_POSTS = 800
export const SIDECAR_HASH = contentHash('mod-report-sidecars-current')
const OLD_HASH = contentHash('mod-report-sidecars-previous')

type ModeratorFixture = {
  agent_id: string
  system_user_id: string
  slug: string
  prompt_id: string
  topic_slug: string
  moderator_count: number
}

async function seedPostDispositions(query: TransactionQuery, postIds: string[]) {
  await query(
    `/* seedReportPostSidecarDispositions */
    WITH versions AS (
      INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
      SELECT post_id, hash, $4
      FROM unnest($1::uuid[]) AS input(post_id)
      CROSS JOIN unnest(ARRAY[$2::bytea, $3::bytea]) AS hashes(hash)
      RETURNING id, content_sha256
    )
    INSERT INTO post_moderation_dispositions (version_id, source, disposition, reason_code, evidence)
    SELECT id, source::post_moderation_sources,
      CASE WHEN content_sha256 = $2 AND source = 'openai_omni'
        THEN 'review'::post_moderation_disposition_types ELSE 'pass' END,
      'explain_sidecar', CASE
        WHEN source = 'openai_omni' AND content_sha256 = $2 THEN '{"flagged_categories":["spam"]}'::jsonb
        WHEN source = 'spam_detection' AND content_sha256 = $2 THEN
          '{"signals":[{"signal":"content_hash_duplicate","flagged":true}]}'::jsonb
        WHEN source = 'spam_detection' THEN
          '{"signals":[{"signal":"embeddings_similarity","flagged":true}]}'::jsonb
        ELSE '{}'::jsonb END
    FROM versions CROSS JOIN unnest(ARRAY['openai_omni','spam_detection']) AS sources(source)`,
    [postIds, SIDECAR_HASH, OLD_HASH, POST_MODERATION_POLICY_REVISION],
  )
}

async function seedAgentSidecars(
  query: TransactionQuery,
  postIds: string[],
  moderator: ModeratorFixture,
) {
  await query(
    `/* seedReportPostAgentModerations */
    INSERT INTO agent_moderations (post_id, prompt_id, agent_id, input_sha256, is_flagged, results, deleted_at)
    SELECT post_id, $2, $3, hash, hash = $4, '{"categories":["spam"]}'::jsonb,
      CASE WHEN hash = $5 THEN CURRENT_TIMESTAMP END
    FROM unnest($1::uuid[]) AS input(post_id)
    CROSS JOIN unnest(ARRAY[$4::bytea, $5::bytea]) AS hashes(hash)`,
    [postIds, moderator.prompt_id, moderator.agent_id, SIDECAR_HASH, OLD_HASH],
  )
  await query(
    `/* seedReportPostAgentTags */
    INSERT INTO relation__post__category__topic (subject_id, object_id, created_by_id)
    SELECT post_id, $2, $3 FROM unnest($1::uuid[]) AS input(post_id)`,
    [postIds, seedTopicId, moderator.system_user_id],
  )
}

async function seedReportPostSidecars(postIds: string[]): Promise<ModeratorFixture> {
  await using query = await beginTransaction()
  const {
    rows: [moderator],
  } = await query<ModeratorFixture>(
    `/* selectReportPostSidecarModerator */
    WITH moderator AS MATERIALIZED (
      SELECT mod.agent_id, agent.system_user_id, mod.slug
      FROM moderator_agents mod JOIN agents agent ON agent.id = mod.agent_id
      ORDER BY mod.agent_id LIMIT 1
    ), prompt AS (
      INSERT INTO agent_prompts (agent_id, prompt, model_name, model_provider)
      SELECT agent_id, 'EXPLAIN report post sidecar', 'gpt-5.4-nano', 'openai' FROM moderator
      RETURNING id, agent_id
    )
    SELECT mod.agent_id, mod.system_user_id, mod.slug, prompt.id AS prompt_id, topic.slug AS topic_slug,
      (SELECT count(*)::int FROM moderator_agents) AS moderator_count
    FROM moderator mod JOIN prompt ON prompt.agent_id = mod.agent_id
    JOIN topics topic ON topic.id = $1`,
    [seedTopicId],
  )
  if (!moderator) throw new Error('The EXPLAIN seed needs a moderator prompt and a topic')
  await query(
    `/* seedReportPostSidecarPosts */
    INSERT INTO posts (id, created_by_id, post_type, created_via, title, markdown, deleted_at,
      llm_moderation_content_sha256, bedrock_nova_multimodal_v1_content_sha256)
    SELECT id, $2, 'discussion', 'system', 'Report sidecar fixture', 'Report sidecar fixture',
      CASE WHEN n = $3 THEN CURRENT_TIMESTAMP END, $4, $4
    FROM unnest($1::uuid[]) WITH ORDINALITY AS input(id, n)`,
    [postIds, seedUser.id, REPORT_POST_PAGE_CAP, SIDECAR_HASH],
  )
  await seedPostDispositions(query, postIds)
  await seedAgentSidecars(query, postIds, moderator)
  await query(
    `/* seedReportPostIntegrityFlags */
    INSERT INTO vote_integrity_flags (post_id, flag_type, resolved_at)
    SELECT post_id, 'velocity_spike', CASE WHEN n % 2 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest($1::uuid[]) WITH ORDINALITY AS input(post_id, n)`,
    [postIds],
  )
  await query.commit()
  return moderator
}

async function countReportPostSidecarCandidates() {
  const {
    rows: [counts],
  } = await write<{
    version_rows: number
    tag_rows: number
    pending_flags: number
  }>(
    `/* countReportPostSidecarCandidates */
    SELECT
      (SELECT count(*)::int FROM post_moderation_versions WHERE policy_revision = $1) AS version_rows,
      (SELECT count(*)::int FROM relation__post__category__topic relation
        JOIN agents agent ON agent.system_user_id = relation.created_by_id
        JOIN moderator_agents mod ON mod.agent_id = agent.id) AS tag_rows,
      (SELECT count(*)::int FROM vote_integrity_flags WHERE resolved_at IS NULL) AS pending_flags`,
    [POST_MODERATION_POLICY_REVISION],
  )
  return counts!
}

export async function loadReportPostSidecars() {
  const start = postSeedTimestampMs(0) + 224_000
  const postIds = Array.from({ length: REPORT_POST_PAGE_CAP + OTHER_POSTS }, (_, n) =>
    seedUuidAtTimestamp(start + n, 4_600_000 + n),
  )
  const moderator = await seedReportPostSidecars(postIds)
  return {
    moderator,
    countCandidates: countReportPostSidecarCandidates,
    reportPostIds: postIds.slice(0, REPORT_POST_PAGE_CAP),
    async cleanup() {
      await write(
        '/* cleanupReportPostSidecarPosts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
        [postIds],
      )
      await write('/* cleanupReportPostSidecarPrompt */ DELETE FROM agent_prompts WHERE id = $1', [
        moderator.prompt_id,
      ])
    },
  }
}
