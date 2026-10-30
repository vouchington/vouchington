import { write, type QueryOptions } from '@data-stores/psql'
import {
  POST_MODERATION_POLICY_REVISION,
  type PostModerationVersion,
} from './moderation-ledger-types.mts'

// A writer that held a post lock first commits its version while ensureCurrentPostModerationVersion
// or commitCurrentPostModerationVersions waits for that lock. ON CONFLICT then skips the insert,
// but the statement's snapshot predates the winner's commit and cannot select the row. A new
// statement sees every such row at once; the winner already created the attempts in the same
// statement that inserted the version. Missing or deleted posts have no row and are omitted.
export async function readCommittedCurrentPostModerationVersions(
  postIds: readonly string[],
  options: QueryOptions = {},
): Promise<PostModerationVersion[]> {
  const { rows } = await write<PostModerationVersion>(
    `/* readCommittedCurrentPostModerationVersions */
    SELECT version.id, version.post_id, version.content_sha256, version.policy_revision,
      version.deadline_at
    FROM posts post
    JOIN post_moderation_versions version
      ON version.post_id = post.id
     AND version.content_sha256 = post.llm_moderation_content_sha256
    WHERE post.id = ANY($1::uuid[])
      AND post.deleted_at IS NULL
      AND version.policy_revision = $2`,
    [postIds, POST_MODERATION_POLICY_REVISION],
    options,
  )
  return rows
}
