import sql, { type SQLStatement } from 'sql-template-strings'
import { BLOCKED_POST_TYPES } from '../../blocked-post-types.mts'

/**
 * Keeps a comment out of the results when an ancestor of its thread is not publicly readable.
 *
 * The public eligibility filter judges a candidate and its thread root. MCP reads
 * (`resolveReadableThread`) judge every live comment from the root down, so a comment under a
 * pending intermediate comment, or under a blocked-type root, would otherwise be found by search
 * but answered as not found by `get_post`. A deleted ancestor is skipped, as in the read chain.
 * The clause is only needed when comments can be candidates.
 */
export function buildThreadReadabilityFilter(): SQLStatement {
  return sql`(posts.post_type <> 'comment' OR NOT EXISTS (
      WITH RECURSIVE thread_ancestors AS (
        SELECT ancestor.id, ancestor.parent_post_id, ancestor.post_type, ancestor.approved_at, ancestor.deleted_at
        FROM posts ancestor
        WHERE ancestor.id = posts.parent_post_id
        UNION ALL
        SELECT parent.id, parent.parent_post_id, parent.post_type, parent.approved_at, parent.deleted_at
        FROM posts parent
        JOIN thread_ancestors child ON child.post_type = 'comment' AND parent.id = child.parent_post_id
      )
      SELECT 1
      FROM thread_ancestors
      WHERE deleted_at IS NULL
        AND (approved_at IS NULL OR post_type::text = ANY(${[...BLOCKED_POST_TYPES]}::text[]))
    ))`
}
