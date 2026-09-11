import sql, { type SQLStatement } from 'sql-template-strings'

export function buildBroadcastVisibilityFilter(
  postsAlias: string,
  currentUserId: string,
): SQLStatement {
  return sql`(`
    .append(`${postsAlias}.broadcast = 'everyone'`)
    .append(sql`
        OR `)
    .append(`${postsAlias}.broadcast = 'users'`)
    .append(sql`
        OR `)
    .append(`${postsAlias}.created_by_id = `)
    .append(sql`${currentUserId}`)
    .append(sql`
        OR (
          `)
    .append(`${postsAlias}.broadcast = 'followers'`)
    .append(sql`
          AND EXISTS (
            SELECT 1
            FROM followed_users
            WHERE followed_users.user_id = `)
    .append(`${postsAlias}.created_by_id`)
    .append(sql`
          )
        )
        OR (
          `)
    .append(`${postsAlias}.broadcast = 'mutual_followers'`)
    .append(sql`
          AND EXISTS (
            SELECT 1
            FROM followed_users
            WHERE followed_users.user_id = `)
    .append(`${postsAlias}.created_by_id`)
    .append(sql`
          )
          AND EXISTS (
            SELECT 1
            FROM relation__user__follow__user
            WHERE subject_id = `)
    .append(`${postsAlias}.created_by_id`).append(sql`
              AND object_id = ${currentUserId}
              AND deleted_at IS NULL
          )
        )
      )`)
}
