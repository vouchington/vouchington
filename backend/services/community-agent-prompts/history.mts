import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityAgentPromptChangeAction } from '@services/community-agent-prompt-audit'

const DEFAULT_LIMIT = 20

export type CommunityAgentPromptHistoryEntry = {
  id: string
  agent_prompt_id: string
  community_id: string
  action: CommunityAgentPromptChangeAction
  changed_by: { id: string; username: string | null } | null
  previous_fields: Record<string, unknown>
  next_fields: Record<string, unknown>
  changed_fields: Record<string, { previous: unknown; next: unknown }>
  created_at: string
}

export type ListCommunityAgentPromptHistoryResult = {
  entries: CommunityAgentPromptHistoryEntry[]
  next_cursor: string | null
}

export async function listCommunityAgentPromptHistory(
  communityId: string,
  options: {
    promptId?: string
    before?: string
    limit?: number
  } = {},
): Promise<ListCommunityAgentPromptHistoryResult> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, 50)

  const query = sql`/* listCommunityAgentPromptHistory */
    SELECT
      c.id,
      c.agent_prompt_id,
      c.community_id,
      c.action,
      c.previous_fields,
      c.next_fields,
      c.created_at,
      c.changed_by_id AS changed_by_user_id,
      u.username AS changed_by_username
    FROM community_agent_prompt_changes c
    LEFT JOIN users u ON u.id = c.changed_by_id AND u.deleted_at IS NULL
    WHERE c.community_id = ${communityId}`

  if (options.promptId) {
    query.append(sql` AND c.agent_prompt_id = ${options.promptId}`)
  }
  if (options.before) {
    query.append(sql` AND c.id < ${options.before}`)
  }

  query.append(sql` ORDER BY c.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read<{
    id: string
    agent_prompt_id: string
    community_id: string
    action: CommunityAgentPromptChangeAction
    previous_fields: Record<string, unknown>
    next_fields: Record<string, unknown>
    created_at: Date
    changed_by_user_id: string | null
    changed_by_username: string | null
  }>(query)

  let nextCursor: string | null = null
  if (rows.length > limit) {
    rows.pop()
    nextCursor = rows[rows.length - 1]?.id ?? null
  }

  const entries: CommunityAgentPromptHistoryEntry[] = rows.map(row => ({
    id: row.id,
    agent_prompt_id: row.agent_prompt_id,
    community_id: row.community_id,
    action: row.action,
    changed_by: row.changed_by_user_id
      ? { id: row.changed_by_user_id, username: row.changed_by_username }
      : null,
    previous_fields: row.previous_fields,
    next_fields: row.next_fields,
    changed_fields: getChangedFields(row.previous_fields, row.next_fields),
    created_at: row.created_at.toISOString(),
  }))

  return { entries, next_cursor: nextCursor }
}

function getChangedFields(
  previousFields: Record<string, unknown>,
  nextFields: Record<string, unknown>,
): Record<string, { previous: unknown; next: unknown }> {
  const changedFields: Record<string, { previous: unknown; next: unknown }> = {}
  for (const key of new Set([...Object.keys(previousFields), ...Object.keys(nextFields)])) {
    if (previousFields[key] !== nextFields[key]) {
      changedFields[key] = {
        previous: previousFields[key],
        next: nextFields[key],
      }
    }
  }
  return changedFields
}
