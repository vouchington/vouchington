import sql, { type SQLStatement } from 'sql-template-strings'
import { itemHasDiscoverableSourceSql } from './discoverability-sql.mts'

const SAFE_SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

export function buildNonDeletedClause(candidateAlias: string, rootAlias: string): SQLStatement {
  return sql`(`
    .append(`${candidateAlias}.deleted_at IS NULL`)
    .append(sql` AND `)
    .append(`${rootAlias}.deleted_at IS NULL`)
    .append(sql`)`)
}
export function buildClearanceClause(alias: string, currentUserId: string | null): SQLStatement {
  return sql`(`
    .append(`${alias}.approved_at IS NOT NULL OR ${alias}.created_by_id = `)
    .append(sql`${currentUserId}`)
    .append(sql`)`)
}
export function buildCommunityAccessClause(
  rootAlias: string,
  currentUserId: string | null,
  requireActiveCommunity: boolean,
): SQLStatement {
  const statement = sql`(`
    .append(`${rootAlias}.community_id IS NULL`)
    .append(sql`
    OR EXISTS (
      SELECT 1
      FROM communities publication_community
      JOIN community_post_reviews publication_review
        ON publication_review.community_id = publication_community.id
       AND publication_review.post_id = `)
    .append(`${rootAlias}.id`)
    .append(sql`
       AND publication_review.approved_at IS NOT NULL
       AND publication_review.rejected_at IS NULL
       AND publication_review.unpublished_at IS NULL
      WHERE publication_community.id = `)
    .append(`${rootAlias}.community_id`).append(sql`
        AND publication_community.deleted_at IS NULL`)
  if (requireActiveCommunity) {
    statement.append(sql`
        AND publication_community.archived_at IS NULL`)
  }
  return statement.append(sql`
        AND (
          publication_community.visibility = 'public'
          OR EXISTS (
            SELECT 1
            FROM community_members publication_member
            WHERE publication_member.community_id = publication_community.id
              AND publication_member.user_id = ${currentUserId}
              AND publication_member.removed_at IS NULL
          )
        )
    )
  )`)
}
export function buildCommunityPublicationStateClause(
  rootAlias: string,
  requireActiveCommunity: boolean,
): SQLStatement {
  const statement = sql`(`
    .append(`${rootAlias}.community_id IS NULL`)
    .append(sql`
    OR EXISTS (
      SELECT 1
      FROM communities publication_community
      JOIN community_post_reviews publication_review
        ON publication_review.community_id = publication_community.id
       AND publication_review.post_id = `)
    .append(`${rootAlias}.id`)
    .append(sql`
       AND publication_review.approved_at IS NOT NULL
       AND publication_review.rejected_at IS NULL
       AND publication_review.unpublished_at IS NULL
      WHERE publication_community.id = `)
    .append(`${rootAlias}.community_id`).append(sql`
        AND publication_community.deleted_at IS NULL`)
  if (requireActiveCommunity)
    statement.append(sql`
        AND publication_community.archived_at IS NULL`)
  return statement.append(sql`
    )
  )`)
}
export function buildRootAudienceAccessClause(
  rootAlias: string,
  currentUserId: string | null,
): SQLStatement {
  return sql`(`
    .append(`${rootAlias}.privacy = 'public'`)
    .append(sql`
    OR (`)
    .append(`${rootAlias}.created_by_id IS NOT NULL`)
    .append(sql`
      AND (
        `)
    .append(`${rootAlias}.created_by_id`)
    .append(sql` = ${currentUserId}
        OR (`)
    .append(`${rootAlias}.broadcast`)
    .append(sql` = 'users' AND ${currentUserId}::uuid IS NOT NULL)
        OR (
          `)
    .append(`${rootAlias}.broadcast`)
    .append(sql` IN ('followers', 'mutual_followers')
          AND EXISTS (
            SELECT 1
            FROM relation__user__follow__user publication_follow
            WHERE publication_follow.subject_id = ${currentUserId}
              AND publication_follow.object_id = `)
    .append(`${rootAlias}.created_by_id`)
    .append(sql`
              AND publication_follow.deleted_at IS NULL
          )
          AND (
            `)
    .append(`${rootAlias}.broadcast`)
    .append(sql` = 'followers'
            OR EXISTS (
              SELECT 1
              FROM relation__user__follow__user publication_mutual_follow
              WHERE publication_mutual_follow.subject_id = `)
    .append(`${rootAlias}.created_by_id`).append(sql`
                AND publication_mutual_follow.object_id = ${currentUserId}
                AND publication_mutual_follow.deleted_at IS NULL
            )
          )
        )
      )
    )
  )`)
}
export function buildRootDiscoveryAudienceAccessClause(
  rootAlias: string,
  currentUserId: string,
): SQLStatement {
  return sql`(`
    .append(`${rootAlias}.created_by_id = `)
    .append(sql`${currentUserId}`)
    .append(sql` OR `)
    .append(`${rootAlias}.broadcast = 'everyone'`)
    .append(sql` OR (`)
    .append(`${rootAlias}.broadcast = 'users'`)
    .append(sql` AND ${currentUserId}::uuid IS NOT NULL)
      OR (
        `)
    .append(`${rootAlias}.broadcast IN ('followers', 'mutual_followers')`)
    .append(sql`
        AND EXISTS (
          SELECT 1
          FROM relation__user__follow__user publication_discovery_follow
          WHERE publication_discovery_follow.subject_id = ${currentUserId}
            AND publication_discovery_follow.object_id = `)
    .append(`${rootAlias}.created_by_id`)
    .append(sql`
            AND publication_discovery_follow.deleted_at IS NULL
        )
        AND (
          `)
    .append(`${rootAlias}.broadcast = 'followers'`)
    .append(sql` OR EXISTS (
            SELECT 1
            FROM relation__user__follow__user publication_discovery_mutual
            WHERE publication_discovery_mutual.subject_id = `)
    .append(`${rootAlias}.created_by_id`).append(sql`
              AND publication_discovery_mutual.object_id = ${currentUserId}
              AND publication_discovery_mutual.deleted_at IS NULL
          )
        )
      )
    )`)
}

export function buildStorySourceAccessClause(rootAlias: string): SQLStatement {
  return sql`(`
    .append(`${rootAlias}.post_type <> 'story'`)
    .append(sql`
    OR EXISTS (
      SELECT 1
      FROM post__stories post_story
      JOIN stories publication_story
        ON publication_story.id = post_story.story_id
       AND publication_story.deleted_at IS NULL
      JOIN rss_feed_items story_item
        ON story_item.story_id = publication_story.id
       AND story_item.deleted_at IS NULL
      WHERE post_story.post_id = `)
    .append(`${rootAlias}.id`)
    .append(sql`
        AND `)
    .append(itemHasDiscoverableSourceSql('story_item.id')).append(sql`
    )
  )`)
}

export function assertSafeSqlAlias(alias: string): void {
  if (!SAFE_SQL_IDENTIFIER.test(alias)) throw new Error(`Unsafe SQL alias: ${alias}`)
}
