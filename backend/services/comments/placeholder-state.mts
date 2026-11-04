import { read } from '@data-stores/psql'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { getCommentLookDownLimits } from './placeholder-config.mts'
import { buildLookDownKeepLateral } from './placeholder-sql.mts'

/**
 * Whether a placeholder should be returned: a valid reply sits below it within the look-down
 * limits, or a limit ended the search without an answer. Hide is ignored on purpose.
 */
export async function commentPlaceholderHasValidReply(
  viewer: PrivateUser | null,
  rootId: string,
  commentId: string,
): Promise<boolean> {
  const eligibility = {
    currentUserId: viewer?.id ?? null,
    isModerationStaff: isModerationStaff(viewer),
  }
  const query = sql`/* commentPlaceholderHasValidReply */
    SELECT COALESCE(look_down_result.keep, false) AS keep
    FROM posts c
    `.append(buildLookDownKeepLateral('c.id', rootId, eligibility, getCommentLookDownLimits()))
    .append(sql`
    WHERE c.id = ${commentId}`)
  const { rows } = await read<{ keep: boolean }>(query.text, query.values)
  return rows[0]?.keep
}
