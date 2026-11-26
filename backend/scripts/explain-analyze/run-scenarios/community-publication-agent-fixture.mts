import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function seedCommunityAgentModerationCapacity(
  query: TransactionQuery,
  communityId: string,
  otherCommunityId: string,
  agentPostId: string,
  postIds: string[],
) {
  const agentId = seedUuid(0, 'ee')
  const { rows: prompts } = await query<{
    id: string
    community_id: string
    deleted_at: Date | null
  }>(sql`
    /* seedCommunityPublicationCapacity:prompts */
    WITH parents AS (
      INSERT INTO agent_prompts (agent_id, prompt, model_name, model_provider, created_by_id)
      SELECT ${agentId}, 'Fixture community rule', 'gpt-5.4-nano', 'openai', ${seedUser.id}
      FROM generate_series(1, 3)
      RETURNING id
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM parents
    )
    INSERT INTO community_agent_prompts (id, community_id, created_by_id, deleted_at)
    SELECT id, CASE WHEN n = 3 THEN ${otherCommunityId}::uuid ELSE ${communityId}::uuid END,
      ${seedUser.id}, CASE WHEN n = 2 THEN CURRENT_TIMESTAMP END
    FROM ranked
    RETURNING id, community_id, deleted_at
  `)
  const livePrompt = prompts.find(
    row => row.community_id === communityId && row.deleted_at === null,
  )!
  const promptIds = prompts.map(row => row.id)
  const { rows: moderations } = await query<{
    id: string
    post_id: string
    prompt_id: string
    deleted_at: Date | null
  }>(sql`
    /* seedCommunityPublicationCapacity:moderations */
    INSERT INTO agent_moderations (post_id, input_sha256, prompt_id, agent_id, results, is_flagged, deleted_at)
    SELECT post_id, decode(lpad(to_hex(n),64,'0'),'hex'), prompt_id, ${agentId}, '{}'::jsonb,
      n % 2 = 0, CASE WHEN n % 7 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${postIds}::uuid[]) AS posts(post_id)
    CROSS JOIN unnest(${promptIds}::uuid[]) AS prompts(prompt_id)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN post_id = ${agentPostId} THEN 245 ELSE 4 END) AS fixture(n)
    ORDER BY n, prompt_id, post_id
    RETURNING id, post_id, prompt_id, deleted_at
  `)
  return {
    moderationIds: moderations
      .filter(
        row =>
          row.post_id === agentPostId && row.prompt_id === livePrompt.id && row.deleted_at === null,
      )
      .map(row => row.id)
      .toSorted(),
    moderationCount: moderations.length,
    promptIds,
  }
}
