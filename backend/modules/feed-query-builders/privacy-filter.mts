import type { BasicUser } from '@voucha/types/entities/user'
import sql, { type SQLStatement } from 'sql-template-strings'
function buildViewerFollowsCreatorClause(
  creatorIdExpression: string,
  currentUserId: string,
): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM relation__user__follow__user
    WHERE subject_id = ${currentUserId}
      AND object_id = `.append(creatorIdExpression).append(sql`
      AND deleted_at IS NULL
  )`)
}

function buildRootAccessClause(rootAlias: string, currentUserId: string): SQLStatement {
  return sql`(`
    .append(`${rootAlias}.broadcast IN ('everyone', 'users')`)
    .append(sql`
    OR `)
    .append(`${rootAlias}.created_by_id = `)
    .append(sql`${currentUserId}`)
    .append(sql`
    OR (
      `)
    .append(`${rootAlias}.broadcast = 'followers'`)
    .append(sql`
      AND `)
    .append(buildViewerFollowsCreatorClause(`${rootAlias}.created_by_id`, currentUserId))
    .append(sql`
    )
    OR (
      `)
    .append(`${rootAlias}.broadcast = 'mutual_followers'`)
    .append(sql`
      AND `)
    .append(buildViewerFollowsCreatorClause(`${rootAlias}.created_by_id`, currentUserId))
    .append(sql`
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user
        WHERE subject_id = `)
    .append(`${rootAlias}.created_by_id`).append(sql`
          AND object_id = ${currentUserId}
          AND deleted_at IS NULL
      )
    )
  )`)
}

function buildNotSuspendedClause(creatorIdExpression: string): SQLStatement {
  return sql`NOT EXISTS (
    SELECT 1 FROM user_suspensions
    WHERE user_id = `.append(creatorIdExpression).append(sql`
      AND lifted_at IS NULL
  )`)
}

/**
 * Builds a SQL WHERE clause fragment that filters out posts the current user cannot
 * see in feeds, search, and listings. Returns null when no filter is needed
 * (admin users).
 *
 * Comments inherit their root post's audience. Since comments are stored as
 * broadcast='everyone'/privacy='public', we check the root post's visibility
 * via a subquery when root_id is set.
 */
export function buildPrivacyFilter(
  postsAlias: string,
  currentUser?: BasicUser | null,
): SQLStatement | null {
  const isAdmin = currentUser?.roles?.includes('administrator') ?? false
  if (isAdmin) return null

  if (!currentUser?.id) {
    // Logged-out users can only see posts that broadcast to everyone and are approved.
    return sql`(`
      .append(`${postsAlias}.root_id IS NULL AND ${postsAlias}.broadcast = 'everyone'`)
      .append(sql`
      OR (`)
      .append(`${postsAlias}.root_id IS NOT NULL`)
      .append(sql` AND EXISTS (
        SELECT 1 FROM posts root_post
        WHERE root_post.id = `)
      .append(`${postsAlias}.root_id`)
      .append(sql`
          AND root_post.deleted_at IS NULL
          AND root_post.broadcast = 'everyone'
      ))
    )`)
      .append(sql`
    AND `)
      .append(buildNotSuspendedClause(`${postsAlias}.created_by_id`))
      .append(sql`
    AND (`)
      .append(`${postsAlias}.approved_at IS NOT NULL`)
      .append(sql`)`)
  }

  const userId = currentUser.id

  return sql`(`
    .append(`${postsAlias}.root_id IS NULL`)
    .append(sql` AND `)
    .append(buildRootAccessClause(postsAlias, userId))
    .append(sql`
    OR (
      `)
    .append(`${postsAlias}.root_id IS NOT NULL`)
    .append(sql` AND EXISTS (
      SELECT 1 FROM posts root_post
      WHERE root_post.id = `)
    .append(`${postsAlias}.root_id`)
    .append(sql`
        AND root_post.deleted_at IS NULL
        AND `)
    .append(buildRootAccessClause('root_post', userId))
    .append(sql`
    ))
  )`)
    .append(sql`
  AND (`)
    .append(`${postsAlias}.created_by_id = `)
    .append(sql`${userId}`)
    .append(sql`
    OR `)
    .append(buildNotSuspendedClause(`${postsAlias}.created_by_id`))
    .append(sql`
  )`)
    .append(sql`
  AND (`)
    .append(`${postsAlias}.approved_at IS NOT NULL`)
    .append(sql` OR `)
    .append(`${postsAlias}.created_by_id = `)
    .append(sql`${userId}`)
    .append(sql`)`)
}
