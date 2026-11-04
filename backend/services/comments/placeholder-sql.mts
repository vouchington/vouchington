import type { DirectPostEligibilityOptions } from '@modules/feed-query-builders'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommentLookDownLimits } from './placeholder-config.mts'

/**
 * A comment is a valid reply, or a placeholder (deleted or unmoderated). Everything else that gates
 * a comment (root deletion, clearance, community, audience) belongs to the thread root and is
 * checked once on it. `getCommentPlaceholderState` in `@services/posts` is the TypeScript twin.
 */
/** SQL true when comment `alias` is a valid reply for the viewer: not deleted, and cleared or their own. */
export function buildCommentIsValidSql(
  alias: string,
  options: DirectPostEligibilityOptions,
): SQLStatement {
  if (options.isModerationStaff) return sql`(`.append(`${alias}.deleted_at IS NULL`).append(')')
  // COALESCE: a signed-out viewer compares created_by_id to NULL, and NOT NULL must not drop a row.
  return sql`COALESCE(`
    .append(
      `${alias}.deleted_at IS NULL AND (${alias}.approved_at IS NOT NULL OR ${alias}.created_by_id = `,
    )
    .append(sql`${options.currentUserId}), false)`)
}

/**
 * A LATERAL subquery exposing `keep`: whether the placeholder `parentIdSql` should be returned.
 * It walks only through placeholders and stops at the first valid reply. The outer LIMIT bounds the
 * rows the recursion produces. A placeholder is kept when a valid reply is found, or when a limit
 * ends the search without an answer, so a valid reply is never lost to a limit. It ignores hide.
 */
export function buildLookDownKeepLateral(
  parentIdSql: string,
  rootId: string,
  options: DirectPostEligibilityOptions,
  limits: CommentLookDownLimits,
  /** Extra condition on the first level; the walk passes "the outer row is a placeholder". */
  guard: SQLStatement = sql`true`,
): SQLStatement {
  return sql`LEFT JOIN LATERAL (
      WITH RECURSIVE look_down AS (
        SELECT k.id, 1 AS depth, `
    .append(buildCommentIsValidSql('k', options))
    .append(
      sql` AS is_valid
        FROM posts k
        WHERE k.root_post_id = ${rootId}
          AND k.parent_post_id = `,
    )
    .append(parentIdSql)
    .append(sql`
          AND k.post_type = 'comment'
          AND `)
    .append(guard)
    .append(sql`
        UNION ALL
        SELECT k.id, look_down.depth + 1, `)
    .append(buildCommentIsValidSql('k', options)).append(sql`
        FROM look_down
        JOIN posts k ON k.parent_post_id = look_down.id
        WHERE NOT look_down.is_valid
          AND look_down.depth < ${limits.maxDepth}
          AND k.root_post_id = ${rootId}
          AND k.post_type = 'comment'
      ),
      bounded AS (SELECT id, depth, is_valid FROM look_down LIMIT ${limits.maxRows})
      SELECT (
        bool_or(is_valid)
        OR count(*) >= ${limits.maxRows}
        OR bool_or(depth >= ${limits.maxDepth})
      ) AS keep
      FROM bounded
    ) look_down_result ON true`)
}
