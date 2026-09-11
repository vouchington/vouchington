import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import type { Agent } from './types.mts'
import { AGENT_DIRECTORY_CURSOR_SCOPE } from '@modules/agents'

export async function searchAgents(options?: { limit?: number; after?: string }) {
  const limit = options?.limit ?? 25

  let cursorId: string | undefined
  if (options?.after) {
    const cursor = decodeScopedUuidCursor(
      options.after,
      AGENT_DIRECTORY_CURSOR_SCOPE,
      'Invalid cursor format',
    )
    cursorId = cursor.id
  }

  const query = sql`/* searchAgents */
    SELECT
      id,
      system_user_id,
      agent_type,
      activated_at,
      deactivated_at,
      created_at,
      updated_at,
      deleted_at
    FROM agents
    WHERE deleted_at IS NULL
  `

  if (cursorId) {
    query.append(sql` AND id < ${cursorId}`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  if (hasNextPage) rows.pop()
  const results: Agent[] = rows

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && results.length > 0
          ? encodeScopedUuidCursor(results.at(-1)!.id, AGENT_DIRECTORY_CURSOR_SCOPE)
          : null,
      start_cursor:
        results.length > 0
          ? encodeScopedUuidCursor(results[0].id, AGENT_DIRECTORY_CURSOR_SCOPE)
          : null,
    },
  }
}
