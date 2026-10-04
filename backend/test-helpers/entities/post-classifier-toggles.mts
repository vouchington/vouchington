import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setPostClassifierToggleForTest(
  communityId: string,
  slug: string,
  enabled: boolean,
): Promise<void> {
  await write(sql`/* setPostClassifierToggleForTest */
    INSERT INTO community_auto_tagger_agents (
      community_id, agent_id, enabled_at, disabled_at
    )
    SELECT ${communityId}, agent.id, CURRENT_TIMESTAMP,
      CASE WHEN ${enabled} THEN NULL ELSE CURRENT_TIMESTAMP END
    FROM agents agent
    JOIN moderator_agents moderator ON moderator.agent_id = agent.id
    WHERE moderator.slug = ${slug}
      AND agent.agent_type = 'moderator'
      AND agent.activated_at IS NOT NULL AND agent.deactivated_at IS NULL
      AND agent.deleted_at IS NULL
    ON CONFLICT (community_id, agent_id) DO UPDATE
    SET enabled_at = EXCLUDED.enabled_at, disabled_at = EXCLUDED.disabled_at
  `)
}
