import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Whether this post was created through the administrator moderation bypass. */
export async function hasPostCreationModerationBypass(postId: string): Promise<boolean> {
  const { rows } = await write<{ creation_moderation_bypassed: boolean }>(
    sql`/* hasPostCreationModerationBypass */
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM post_clearance_changes
          WHERE post_id = ${postId}
            AND metadata ? 'creation_moderation_bypassed'
        ) THEN EXISTS (
          SELECT 1
          FROM post_clearance_changes
          WHERE post_id = ${postId}
            AND metadata @> '{"creation_moderation_bypassed":true}'::jsonb
        )
        ELSE EXISTS (
          SELECT 1
          FROM posts
          INNER JOIN user_roles
            ON user_roles.user_id = posts.created_by_id
            AND user_roles.created_at <= posts.created_at
          INNER JOIN user_roles_types
            ON user_roles_types.id = user_roles.role_type_id
            AND user_roles_types.slug = 'administrator'
          INNER JOIN LATERAL (
            SELECT change_type, changed_by_id
            FROM post_clearance_changes
            WHERE post_id = posts.id
            ORDER BY id ASC
            LIMIT 1
          ) AS initial_clearance ON true
          WHERE posts.id = ${postId}
            AND initial_clearance.change_type = 'approve'
            AND initial_clearance.changed_by_id = posts.created_by_id
            AND EXISTS (
              SELECT 1
              FROM post_revisions
              WHERE post_id = posts.id
                AND revision_type = 'create'
                AND revised_by_id = posts.created_by_id
            )
        )
      END AS creation_moderation_bypassed`,
  )
  return rows[0]?.creation_moderation_bypassed === true
}
