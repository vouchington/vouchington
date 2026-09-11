import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Agent, AgentModerator } from './types.mts'
import { validate as isUUID } from 'uuid'

type AgentWithModerator = Agent & {
  slug?: string
  moderator?: AgentModerator
}

export function getAgentByAny(idOrSlug: string): Promise<AgentWithModerator | null> {
  if (isUUID(idOrSlug)) return getAgentById(idOrSlug)
  return getAgentBySlug(idOrSlug)
}

async function getAgentById(id: string): Promise<AgentWithModerator | null> {
  const { rows } = await read(sql`/* getAgentById */
    SELECT
      a.id,
      a.system_user_id,
      a.agent_type,
      a.activated_at,
      a.deactivated_at,
      a.created_at,
      a.updated_at,
      a.deleted_at,
      m.slug,
      m.created_at AS moderator_created_at,
      m.updated_at AS moderator_updated_at
    FROM agents a
    LEFT JOIN agents__moderators m ON m.agent_id = a.id
    WHERE a.id = ${id}
      AND a.deleted_at IS NULL
    LIMIT 1
  `)

  if (rows.length === 0) return null
  return rowToAgentWithModerator(rows[0])
}

async function getAgentBySlug(slug: string): Promise<AgentWithModerator | null> {
  const { rows } = await read(sql`/* getAgentBySlug */
    SELECT
      a.id,
      a.system_user_id,
      a.agent_type,
      a.activated_at,
      a.deactivated_at,
      a.created_at,
      a.updated_at,
      a.deleted_at,
      m.slug,
      m.created_at AS moderator_created_at,
      m.updated_at AS moderator_updated_at
    FROM agents a
    JOIN agents__moderators m ON m.agent_id = a.id
    WHERE m.slug = ${slug}
      AND a.deleted_at IS NULL
    LIMIT 1
  `)

  if (rows.length === 0) return null
  return rowToAgentWithModerator(rows[0])
}

function rowToAgentWithModerator(row: Record<string, unknown>): AgentWithModerator {
  const agent: AgentWithModerator = {
    id: row.id as string,
    system_user_id: row.system_user_id as string,
    agent_type: row.agent_type as Agent['agent_type'],
    activated_at: row.activated_at as Date | null,
    deactivated_at: row.deactivated_at as Date | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    deleted_at: row.deleted_at as Date | null,
  }

  if (row.slug) {
    agent.slug = row.slug as string
    agent.moderator = {
      agent_id: row.id as string,
      created_at: row.moderator_created_at as Date,
      updated_at: row.moderator_updated_at as Date,
    }
  }

  return agent
}
