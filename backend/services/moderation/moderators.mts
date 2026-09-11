import type { PrivateUser, BasicUser } from '@services/users/types'
import { read, write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { isSlug } from '@modules/utils'

type PostLLMModerator = {
  id: string
  slug: string
  system_user_id: string
  activated_at: Date | null
  deactivated_at: Date | null
  created_at: Date
}

export async function createPostLLMModerator(
  currentUser: PrivateUser,
  systemUser: BasicUser,
  slug: string,
): Promise<PostLLMModerator> {
  assert(isSlug(slug), 422, 'Moderator slug must be a valid slug')

  const { rows } = await write(sql`/* createPostLLMModerator */
    WITH new_agent AS (
      INSERT INTO agents (system_user_id, agent_type, created_by_id)
      VALUES (${systemUser.id}, 'moderator', ${currentUser.id})
      RETURNING id, system_user_id, activated_at, deactivated_at, created_at
    )
    INSERT INTO agents__moderators (agent_id, slug)
    SELECT id, ${slug}
    FROM new_agent
    RETURNING agent_id as id, slug, (SELECT system_user_id FROM new_agent) as system_user_id,
              (SELECT activated_at FROM new_agent) as activated_at,
              (SELECT deactivated_at FROM new_agent) as deactivated_at,
              (SELECT created_at FROM new_agent) as created_at
  `)
  return rows[0]
}

export async function getActivePostLLMModerators(): Promise<PostLLMModerator[]> {
  const { rows } = await read(sql`/* getActivePostLLMModerators */
    SELECT
      a.id,
      am.slug,
      a.system_user_id,
      a.activated_at,
      a.deactivated_at,
      a.created_at
    FROM agents a
    INNER JOIN agents__moderators am ON am.agent_id = a.id
    WHERE a.activated_at IS NOT NULL
      AND a.deactivated_at IS NULL
      AND a.deleted_at IS NULL
      AND a.agent_type = 'moderator'
    ORDER BY am.slug ASC
  `)
  return rows
}

export async function getPostLLMModeratorBySlug(slug: string): Promise<PostLLMModerator | null> {
  const { rows } = await read(sql`/* getPostLLMModeratorBySlug */
    SELECT
      a.id,
      am.slug,
      a.system_user_id,
      a.activated_at,
      a.deactivated_at,
      a.created_at
    FROM agents a
    INNER JOIN agents__moderators am ON am.agent_id = a.id
    WHERE am.slug = ${slug}
      AND a.deleted_at IS NULL
      AND a.agent_type = 'moderator'
  `)
  return rows[0] || null
}

async function getPostLLMModeratorById(id: string): Promise<PostLLMModerator | null> {
  const { rows } = await read(sql`/* getPostLLMModeratorById */
    SELECT
      a.id,
      am.slug,
      a.system_user_id,
      a.activated_at,
      a.deactivated_at,
      a.created_at
    FROM agents a
    INNER JOIN agents__moderators am ON am.agent_id = a.id
    WHERE a.id = ${id}
      AND a.deleted_at IS NULL
      AND a.agent_type = 'moderator'
  `)
  return rows[0] || null
}

type UpdatePostLLMModeratorOptions = {
  active?: boolean
  onFlagAction?: 'none' | 'review_queue'
}

export async function updatePostLLMModerator(
  currentUser: PrivateUser,
  moderatorId: string,
  updates: UpdatePostLLMModeratorOptions,
): Promise<PostLLMModerator | null> {
  assert(currentUser, 422, 'User is required')

  if (updates.active === undefined && updates.onFlagAction === undefined) {
    return null
  }

  await using query = await beginTransaction()
  if (updates.active !== undefined) {
    await query(sql`/* updatePostLLMModerator */
        UPDATE agents
        SET activated_at = CASE WHEN ${updates.active} THEN CURRENT_TIMESTAMP ELSE NULL END,
            deactivated_at = CASE WHEN ${updates.active} THEN NULL ELSE CURRENT_TIMESTAMP END,
            updated_by_id = ${currentUser.id},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${moderatorId}
          AND deleted_at IS NULL
          AND agent_type = 'moderator'
      `)
  }

  if (updates.onFlagAction !== undefined) {
    await query(sql`/* updatePostLLMModerator */
        UPDATE agents__moderators
        SET on_flag_action = ${updates.onFlagAction},
            updated_at = CURRENT_TIMESTAMP
        WHERE agent_id = ${moderatorId}
      `)
  }
  await query.commit()

  return getPostLLMModeratorById(moderatorId)
}
