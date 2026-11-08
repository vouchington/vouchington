import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS = 1000

function slotNoiseIds() {
  const indexes = Array.from(
    { length: COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS },
    (_, i) => i,
  )
  const creatorIds = indexes.map(index => seedUuid(index, 'f0'))
  const communityIds = indexes.map(index => seedUuid(index, 'f1'))
  const systemUserIds = indexes.map(index => seedUuid(index, 'f2'))
  const agentIds = indexes.map(index => seedUuid(index, 'f3'))
  const promptIds = indexes.map(index => seedUuid(index, 'f4'))
  return { creatorIds, communityIds, systemUserIds, agentIds, promptIds }
}

/** Independent owner communities make the creator quota lookup selective. */
export async function seedCommunityAgentPromptSlotCountNoise(): Promise<void> {
  const { creatorIds, communityIds, systemUserIds, agentIds, promptIds } = slotNoiseIds()
  await using query = await beginTransaction()
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:creators */
    INSERT INTO users (id, username)
    SELECT id, 'explain-slot-creator-' || ordinal::text
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [creatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:communities */
    INSERT INTO communities (id, name, slug, created_by_id, created_via, visibility)
    SELECT community_id, 'Explain Slot Community ' || ordinal::text,
      'explain-slot-community-' || ordinal::text, creator_id, 'system', 'private'
    FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY
      seed(community_id, creator_id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [communityIds, creatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:owners */
    INSERT INTO community_members (community_id, user_id, role)
    SELECT community_id, creator_id, 'owner'
    FROM unnest($1::uuid[], $2::uuid[]) seed(community_id, creator_id)
    ON CONFLICT DO NOTHING`,
    [communityIds, creatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:systemUsers */
    INSERT INTO users (id, username, platform_account_kind)
    SELECT id, 'explain-slot-system-' || ordinal::text, 'system'
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [systemUserIds],
  )
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:agents */
    INSERT INTO agents (id, system_user_id, agent_type, created_by_id)
    SELECT agent_id, system_user_id, 'moderator', creator_id
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
      seed(agent_id, system_user_id, creator_id)
    ON CONFLICT (id) DO NOTHING`,
    [agentIds, systemUserIds, creatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:prompts */
    INSERT INTO agent_prompts (id, agent_id, prompt, model_name, model_provider, created_by_id)
    SELECT prompt_id, agent_id, 'Explain allocated prompt', 'gpt-5.4-nano', 'openai', creator_id
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(prompt_id, agent_id, creator_id)
    ON CONFLICT (id) DO NOTHING`,
    [promptIds, agentIds, creatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptSlotCountNoise:communityPrompts */
    INSERT INTO community_agent_prompts
      (id, community_id, created_by_id, is_slot_allocated, activated_at)
    SELECT prompt_id, community_id, creator_id, true, CURRENT_TIMESTAMP
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
      seed(prompt_id, community_id, creator_id)
    ON CONFLICT (id) DO NOTHING`,
    [promptIds, communityIds, creatorIds],
  )
  await query(`/* seedCommunityAgentPromptSlotCountNoise:analyze */
    ANALYZE community_agent_prompt_slot_counts, community_agent_prompts`)
  await query.commit()
}

/** Remove only the deterministic quota-noise cohort after its two slot scenarios. */
export async function cleanupCommunityAgentPromptSlotCountNoise(): Promise<void> {
  const { creatorIds, communityIds, systemUserIds } = slotNoiseIds()
  await using query = await beginTransaction()
  await query(
    `/* cleanupCommunityAgentPromptSlotCountNoise:communities */
    DELETE FROM communities WHERE id = ANY($1::uuid[])`,
    [communityIds],
  )
  await query(
    `/* cleanupCommunityAgentPromptSlotCountNoise:systemUsers */
    DELETE FROM users WHERE id = ANY($1::uuid[])`,
    [systemUserIds],
  )
  await query(
    `/* cleanupCommunityAgentPromptSlotCountNoise:creators */
    DELETE FROM users WHERE id = ANY($1::uuid[])`,
    [creatorIds],
  )
  await query.commit()

  // User deletion's deferred quota cleanup has completed before retiring these owned roots.
  await using roots = await beginTransaction()
  await roots(
    `/* cleanupCommunityAgentPromptSlotCountNoise:retainedUsers */
    DELETE FROM retained_user_identities
    WHERE id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`,
    [systemUserIds, creatorIds],
  )
  await roots(`/* cleanupCommunityAgentPromptSlotCountNoise:analyze */
    ANALYZE users, community_agent_prompt_slot_counts, community_agent_prompts`)
  await roots.commit()
}
