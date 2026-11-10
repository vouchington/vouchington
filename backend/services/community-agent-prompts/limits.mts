import type { TransactionQuery } from '@data-stores/psql'
import { COMMUNITY_AGENT_PROMPT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getCommunityAgentPromptLimit } from './config.mts'

/** The transaction holds the creator/community admission fence until its insert commits. */
export async function assertCommunityAgentPromptCapacity(
  currentUserId: string,
  communityId: string,
  query: TransactionQuery,
): Promise<void> {
  const limit = getCommunityAgentPromptLimit()
  const { rows } = await query<{ count: number }>(sql`/* assertCommunityAgentPromptCapacity */
    SELECT count(*)::int AS count FROM (
      SELECT 1 FROM community_agent_prompts
      WHERE community_id = ${communityId} AND created_by_id = ${currentUserId}
        AND deleted_at IS NULL
      ORDER BY id
      LIMIT ${limit}
    ) capped
  `)
  if (rows[0]!.count >= limit) {
    throw createCodedError(
      409,
      'Community agent prompt limit reached',
      COMMUNITY_AGENT_PROMPT_LIMIT_REACHED,
    )
  }
}
