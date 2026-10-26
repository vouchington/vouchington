import { getOpenaiBackgroundResponsesWorkLimit } from './work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const BACKGROUND_RESPONSE_RECOVERY_AGE_MS = 3 * 60_000

export interface BackgroundResponseToReconcile {
  responseId: string
  agentSlug: string
  communityId: string | null
  postId: string | null
  createdAt: Date
}

export interface AgedBackgroundResponse extends BackgroundResponseToReconcile {
  id: string
}

interface BackgroundResponseRow {
  id: string
  response_id: string
  agent_slug: string
  community_id: string | null
  post_id: string | null
  created_at: Date
}

/** Inline requests have no GlideMQ job; scan their registry by immutable creation age. */
export async function getAgedBackgroundResponses(
  options: { batchSize?: number; after?: string } = {},
): Promise<AgedBackgroundResponse[]> {
  const maximum = getOpenaiBackgroundResponsesWorkLimit('reconcile_batch_size')
  const batchSize = Math.min(Math.max(Math.trunc(options.batchSize ?? maximum), 1), maximum)
  const query = sql`/* getAgedBackgroundResponses */
    SELECT id, response_id, agent_slug, community_id, post_id, created_at
    FROM openai_background_responses
    WHERE id <= fn_min_uuidv7(CURRENT_TIMESTAMP - ${BACKGROUND_RESPONSE_RECOVERY_AGE_MS}::bigint * INTERVAL '1 millisecond')
  `
  if (options.after) query.append(sql` AND id > ${options.after}::uuid`)
  query.append(sql` ORDER BY id ASC LIMIT ${batchSize}`)
  const { rows } = await write<BackgroundResponseRow>(query)
  return rows.map(row => ({
    id: row.id,
    responseId: row.response_id,
    agentSlug: row.agent_slug,
    communityId: row.community_id,
    postId: row.post_id,
    createdAt: row.created_at,
  }))
}
