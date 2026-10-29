import { write, type QueryOptions } from '@data-stores/psql'
import {
  POST_MODERATION_POLICY_REVISION,
  type PostModerationVersion,
} from './moderation-ledger-types.mts'

// A writer that held the post lock first commits its version while ensureCurrentPostModerationVersion
// waits for that lock. ON CONFLICT then skips the insert, but the statement's snapshot predates
// the winner's commit and cannot select the row. A new statement sees it; the winner already
// created the attempts in the same statement that inserted the version.
export async function readCommittedCurrentPostModerationVersion(
  postId: string,
  options: QueryOptions,
): Promise<PostModerationVersion | undefined> {
  const { rows } = await write<PostModerationVersion>(
    `/* readCommittedCurrentPostModerationVersion */
    SELECT version.id, version.post_id, version.content_sha256, version.policy_revision,
      version.deadline_at
    FROM posts post
    JOIN post_moderation_versions version
      ON version.post_id = post.id
     AND version.content_sha256 = post.llm_moderation_content_sha256
    WHERE post.id = $1
      AND post.deleted_at IS NULL
      AND version.policy_revision = $2`,
    [postId, POST_MODERATION_POLICY_REVISION],
    options,
  )
  return rows[0]
}
