import { write } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

/** Moderator agents seeded beside the migration catalog so a catalog scan is visible in the plan. */
export const POST_MODERATION_HISTORY_CATALOG_SIZE = 500
const HISTORY_AGENT_COUNT = 10

async function seedModeratorCatalog(): Promise<string[]> {
  const indexes = Array.from({ length: POST_MODERATION_HISTORY_CATALOG_SIZE }, (_, i) => i)
  const userIds = indexes.map(index => seedUuid(2_600_000 + index, '37'))
  const agentIds = indexes.map(index => seedUuid(2_600_000 + index, '36'))
  await write(
    `/* seedPostModerationHistoryCatalogUsers */
    INSERT INTO users (id, username, platform_account_kind)
    SELECT id, 'explain-history-moderator-' || ordinal, 'system'
    FROM unnest($1::uuid[]) WITH ORDINALITY AS catalog(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [userIds],
  )
  await write(
    `/* seedPostModerationHistoryCatalogAgents */
    INSERT INTO agents (id, system_user_id, agent_type)
    SELECT agent_id, user_id, 'moderator'
    FROM unnest($1::uuid[], $2::uuid[]) AS catalog(agent_id, user_id)
    ON CONFLICT (id) DO NOTHING`,
    [agentIds, userIds],
  )
  await write(
    `/* seedPostModerationHistoryCatalogModerators */
    INSERT INTO moderator_agents (agent_id, slug)
    SELECT agent_id, 'explain-history-moderator-' || ordinal
    FROM unnest($1::uuid[]) WITH ORDINALITY AS catalog(agent_id, ordinal)
    ON CONFLICT (agent_id) DO NOTHING`,
    [agentIds],
  )
  return agentIds.slice(0, HISTORY_AGENT_COUNT)
}

/** A long live history distinguishes top-ten walks from ranking every visible result. */
export async function seedPostModerationHistoryPage(postId: string): Promise<void> {
  const historyAgentIds = await seedModeratorCatalog()
  await write(
    `/* seedPostModerationHistoryParent */
    INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    VALUES ($1::uuid, $2::uuid, 'discussion', 'Moderation history plan', 'Moderation history plan',
      'system', decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex'))
    ON CONFLICT (id) DO NOTHING`,
    [postId, seedUuid(0, '01')],
  )
  const historyIds = Array.from({ length: 1_000 }, (_, index) =>
    seedUuidAtTimestamp(postSeedTimestampMs(0) - 95 * 24 * 60 * 60 * 1_000, 2_500_000 + index),
  )
  await write(
    `/* seedPostModerationHistoryPage */
    INSERT INTO agent_moderations (id, post_id, input_sha256, prompt_id, agent_id, results, is_flagged)
    SELECT id, $2::uuid, decode(lpad(to_hex(ordinal + 100000), 64, '0'), 'hex'),
      $3::uuid, ($4::uuid[])[1 + (ordinal % cardinality($4::uuid[]))::int], '{}'::jsonb, FALSE
    FROM unnest($1::uuid[]) WITH ORDINALITY AS history(id, ordinal)
    ON CONFLICT (post_id, input_sha256, prompt_id) DO NOTHING`,
    [historyIds, postId, seedUuid(2_000_000, '35'), historyAgentIds],
  )
  await write('/* analyzePostModerationHistoryPage */ ANALYZE agent_moderations, moderator_agents')
}

/** Remove the catalog and its history so later scenarios keep their seeded user cardinality. */
export async function removePostModerationHistoryCatalog(): Promise<void> {
  const prefix = 'explain-history-moderator-%'
  await write(
    `/* removePostModerationHistoryResults */
    DELETE FROM agent_moderations
    WHERE agent_id IN (SELECT agent_id FROM moderator_agents WHERE slug LIKE $1)`,
    [prefix],
  )
  await write(
    `/* removePostModerationHistoryModerators */
    DELETE FROM moderator_agents WHERE slug LIKE $1`,
    [prefix],
  )
  await write(
    `/* removePostModerationHistoryAgents */
    DELETE FROM agents
    WHERE system_user_id IN (SELECT id FROM users WHERE username LIKE $1)`,
    [prefix],
  )
  await write(
    `/* removePostModerationHistoryUsers */
    DELETE FROM users WHERE username LIKE $1`,
    [prefix],
  )
}
