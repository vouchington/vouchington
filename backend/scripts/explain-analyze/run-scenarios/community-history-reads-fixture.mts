import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { heavyFollowUser, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const backgroundCommunities = 24
const backgroundUsers = Array.from({ length: 48 }, (_, i) => seedUuid(i + 2_000, '01'))

export async function seedCommunityHistoryReads() {
  const prefix = `explain-community-history-${randomUUID()}`
  await using query = await beginTransaction()
  const { rows: communities } = await query<{ id: string; slug: string }>(sql`
    /* seedCommunityHistoryReads:communities */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    SELECT 'Explain community history ' || n, ${prefix}::text || '-' || n, ${seedUser.id}, 'system'
    FROM generate_series(0, ${backgroundCommunities}::int) AS fixture(n)
    RETURNING id, slug
  `)
  const communityId = communities.find(row => row.slug === `${prefix}-0`)!.id
  const communityIds = [
    communityId,
    ...communities.filter(row => row.id !== communityId).map(row => row.id),
  ]
  const { rows: replies } = await query<{
    id: string
    community_id: string
    order_index: number
    deleted_at: Date | null
  }>(sql`
    /* seedCommunityHistoryReads:replies */
    INSERT INTO community_saved_replies (community_id, title, body, order_index, created_by_id, deleted_at)
    SELECT community_id, 'Fixture saved reply', 'Thanks for contacting the moderation team.',
      n, ${seedUser.id}, CASE WHEN retired THEN CURRENT_TIMESTAMP END
    FROM unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN ordinal = 1 THEN 215 ELSE 96 END) AS fixture(n)
    CROSS JOIN (VALUES (false), (true)) AS state(retired)
    WHERE NOT retired OR n % 5 = 0 OR n IN (100, 101)
    ORDER BY n, ordinal, retired
    RETURNING id, community_id, order_index, deleted_at
  `)

  const { rows: revisions } = await query<{ id: string; community_id: string }>(sql`
    /* seedCommunityHistoryReads:revisions */
    WITH parents AS (
      INSERT INTO agent_prompts (agent_id, prompt, model_name, model_provider, created_by_id)
      SELECT ${seedUuid(0, 'ee')}, 'Fixture moderation policy', 'gpt-5.4-nano', 'openai', ${seedUser.id}
      FROM generate_series(1, cardinality(${communityIds}::uuid[]) * 4)
      RETURNING id
    ), prompts AS (
      INSERT INTO community_agent_prompts (id, community_id, created_by_id)
      SELECT parents.id, (${communityIds}::uuid[])[((row_number() OVER (ORDER BY parents.id) - 1) / 4 + 1)::int],
        ${seedUser.id}
      FROM parents
      RETURNING id, community_id
    )
    INSERT INTO community_agent_prompt_revisions
      (community_id, community_agent_prompt_id, revised_by_id, revision_type, changes)
    SELECT community_id, id, ${seedUser.id}, 'updated',
      jsonb_build_object('prompt', jsonb_build_object('before', 'Policy ' || (n - 1), 'after', 'Policy ' || n))
    FROM prompts CROSS JOIN generate_series(1, 48) AS fixture(n)
    ORDER BY n, community_id, id
    RETURNING id, community_id
  `)

  const { rows: actions } = await query<{
    id: string
    community_id: string
    action_type: string
  }>(sql`
    /* seedCommunityHistoryReads:actions */
    INSERT INTO moderator_actions (community_id, actor_user_id, target_user_id, action_type, reason)
    SELECT community_id, ${seedUser.id}, ${heavyFollowUser.id},
      CASE WHEN n % 3 = 0 THEN 'warn'::moderator_action_types ELSE 'ban'::moderator_action_types END,
      'Explain moderator action'
    FROM unnest(${communityIds}::uuid[]) WITH ORDINALITY AS community(community_id, ordinal)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN ordinal = 1 THEN 645 ELSE 192 END) AS fixture(n)
    ORDER BY n, ordinal
    RETURNING id, community_id, action_type
  `)

  const {
    rows: [target],
  } = await query<{ id: string }>(sql`
    /* seedCommunityHistoryReads:noteTarget */
    INSERT INTO users (username) VALUES (${`explain-note-${randomUUID().slice(0, 12)}`})
    RETURNING id
  `)
  const { rows: notes } = await query<{
    id: string
    target_user_id: string
    deleted_at: Date | null
  }>(sql`
    /* seedCommunityHistoryReads:notes */
    INSERT INTO user_moderator_notes (target_user_id, author_user_id, community_id, body, deleted_at)
    SELECT target_user_id, ${seedUser.id}, ${communityId}, 'Explain user moderator note',
      CASE WHEN n % 5 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${[target!.id, ...backgroundUsers]}::uuid[]) WITH ORDINALITY AS owner(target_user_id, ordinal)
    CROSS JOIN LATERAL generate_series(1, CASE WHEN ordinal = 1 THEN 280 ELSE 96 END) AS fixture(n)
    ORDER BY n, ordinal
    RETURNING id, target_user_id, deleted_at
  `)
  await query.commit()

  return {
    communityId,
    noteTargetId: target!.id,
    replies: replies
      .filter(row => row.community_id === communityId && row.deleted_at === null)
      .toSorted((a, b) => a.order_index - b.order_index),
    revisionIds: newestIds(revisions.filter(row => row.community_id === communityId)),
    actionIds: newestIds(
      actions.filter(row => row.community_id === communityId && row.action_type === 'warn'),
    ),
    noteIds: newestIds(
      notes.filter(row => row.target_user_id === target!.id && row.deleted_at === null),
    ),
    seededRows: {
      community_saved_replies: replies.length,
      community_agent_prompt_revisions: revisions.length,
      moderator_actions: actions.length,
      user_moderator_notes: notes.length,
    },
    async cleanup() {
      await using cleanup = await beginTransaction()
      await cleanup(sql`/* cleanupCommunityHistoryReads:actions */
        DELETE FROM moderator_actions WHERE id = ANY(${actions.map(row => row.id)}::uuid[])`)
      await cleanup(sql`/* cleanupCommunityHistoryReads:prompts */
        DELETE FROM agent_prompts WHERE id IN (
          SELECT id FROM community_agent_prompts WHERE community_id = ANY(${communityIds}::uuid[])
        )`)
      await cleanup(sql`/* cleanupCommunityHistoryReads:communities */
        DELETE FROM communities WHERE id = ANY(${communityIds}::uuid[])`)
      await cleanup(sql`/* cleanupCommunityHistoryReads:noteTarget */
        DELETE FROM users WHERE id = ${target!.id}`)
      await cleanup.commit()
    },
  }
}

function newestIds(rows: readonly { id: string }[]): string[] {
  return rows
    .map(row => row.id)
    .toSorted()
    .toReversed()
}
