import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

import {
  COMMUNITY_AGENT_PROMPT_CREATOR_COUNT,
  COMMUNITY_AGENT_PROMPTS_PER_CREATOR,
  COMMUNITY_AGENT_PROMPT_PAGE_ROWS,
  COMMUNITY_AGENT_PROMPT_TOTAL_ROWS,
  COMMUNITY_AGENT_PROMPT_NOISE_COMMUNITIES,
  COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID,
} from '../community-agent-prompt-page-ids.mts'

/** One owner and 99 moderators each retain the default maximum of 25 unallocated drafts. */
export async function seedCommunityAgentPromptPages(): Promise<void> {
  const creatorIds = Array.from({ length: COMMUNITY_AGENT_PROMPT_CREATOR_COUNT }, (_, i) =>
    seedUuid(i, 'ec'),
  )
  const promptIds = Array.from({ length: COMMUNITY_AGENT_PROMPT_TOTAL_ROWS }, (_, i) =>
    seedUuid(i, 'ef'),
  )
  const systemUserIds = promptIds.map((_, i) => seedUuid(i, 'ed'))
  const agentIds = promptIds.map((_, i) => seedUuid(i, 'ee'))
  const promptCreatorIds = promptIds.map((_, i) =>
    i < COMMUNITY_AGENT_PROMPT_PAGE_ROWS
      ? creatorIds[Math.floor(i / COMMUNITY_AGENT_PROMPTS_PER_CREATOR)]!
      : creatorIds[0]!,
  )
  const noiseCommunityIds = Array.from(
    { length: COMMUNITY_AGENT_PROMPT_NOISE_COMMUNITIES },
    (_, i) => seedUuid(i + 1, 'eb'),
  )
  const promptCommunityIds = promptIds.map((_, i) =>
    i < COMMUNITY_AGENT_PROMPT_PAGE_ROWS
      ? COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID
      : noiseCommunityIds[
          Math.floor((i - COMMUNITY_AGENT_PROMPT_PAGE_ROWS) / COMMUNITY_AGENT_PROMPTS_PER_CREATOR)
        ]!,
  )
  await using query = await beginTransaction()
  await query(
    `/* seedCommunityAgentPromptPages:creators */
    INSERT INTO users (id, username)
    SELECT id, 'explain-prompt-creator-' || ordinal::text
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [creatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptPages:community */
    INSERT INTO communities (id, name, slug, created_by_id, created_via)
    VALUES ($1, 'Explain Prompt Pages', 'explain-prompt-pages', $2, 'system')
    ON CONFLICT (id) DO NOTHING`,
    [COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID, creatorIds[0]],
  )
  await query(
    `/* seedCommunityAgentPromptPages:members */
    INSERT INTO community_members (community_id, user_id, role)
    SELECT $1, id, CASE WHEN ordinal = 1 THEN 'owner'::community_member_roles
      ELSE 'moderator'::community_member_roles END
    FROM unnest($2::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT DO NOTHING`,
    [COMMUNITY_AGENT_PROMPT_PAGE_COMMUNITY_ID, creatorIds],
  )
  // The target creator also owns 99 communities with 25 drafts each, within the membership cap.
  await query(
    `/* seedCommunityAgentPromptPages:noiseCommunities */
    INSERT INTO communities (id, name, slug, created_by_id, created_via)
    SELECT id, 'Explain Prompt Noise ' || ordinal::text,
      'explain-prompt-noise-' || ordinal::text, $2, 'system'
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [noiseCommunityIds, creatorIds[0]],
  )
  await query(
    `/* seedCommunityAgentPromptPages:noiseOwners */
    INSERT INTO community_members (community_id, user_id, role)
    SELECT id, $2, 'owner' FROM unnest($1::uuid[]) seed(id)
    ON CONFLICT DO NOTHING`,
    [noiseCommunityIds, creatorIds[0]],
  )
  await query(
    `/* seedCommunityAgentPromptPages:systemUsers */
    INSERT INTO users (id, username, platform_account_kind)
    SELECT id, 'explain-prompt-system-' || ordinal::text, 'system'
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [systemUserIds],
  )
  await query(
    `/* seedCommunityAgentPromptPages:agents */
    INSERT INTO agents (id, system_user_id, agent_type, created_by_id)
    SELECT id, system_user_id, 'moderator', created_by_id
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(id, system_user_id, created_by_id)
    ON CONFLICT (id) DO NOTHING`,
    [agentIds, systemUserIds, promptCreatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptPages:prompts */
    INSERT INTO agent_prompts (id, agent_id, prompt, model_name, model_provider, created_by_id)
    SELECT id, agent_id, 'Explain bounded draft prompt', 'gpt-5.4-nano', 'openai', created_by_id
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(id, agent_id, created_by_id)
    ON CONFLICT (id) DO NOTHING`,
    [promptIds, agentIds, promptCreatorIds],
  )
  await query(
    `/* seedCommunityAgentPromptPages:communityPrompts */
    INSERT INTO community_agent_prompts (id, community_id, created_by_id)
    SELECT id, community_id, created_by_id
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(id, community_id, created_by_id)
    ON CONFLICT (id) DO NOTHING`,
    [promptIds, promptCommunityIds, promptCreatorIds],
  )
  await query(`/* seedCommunityAgentPromptPages:analyze */
    ANALYZE community_agent_prompts, agent_prompts, agents, users, communities, community_members`)
  await query.commit()
}
