import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { FINITE_VALUES } from '@data-stores/psql/finite-values/index'
import { publicationPageLimit } from './page-limit.mts'
import { nativeSourceBounds, nativeSourceRange } from './native-source-range.mts'

export type PublicationSourceBranch =
  | 'review'
  | 'data'
  | 'relation'
  | 'alias_source'
  | 'alias_relation'
  | 'static'
  | 'slug'

function sourcePageHead(postId: string): SQLStatement {
  return sql`/* listPostPublicationIdentityNativeSourcePage */ WITH `
    .append(nativeSourceBounds(postId))
    .append(sql`, page AS MATERIALIZED (`)
}

export function sourceBranchSql(
  branch: PublicationSourceBranch,
  postId: string,
  cursor: string | null,
  limit: number,
): SQLStatement {
  switch (branch) {
    case 'review':
    case 'data':
      return topicSourceSql(branch, postId, cursor, limit)
    case 'relation':
    case 'alias_relation':
      return relationSourceSql(branch, postId, cursor, limit)
    case 'alias_source':
      return aliasSourceSql(postId, cursor, limit)
    case 'slug':
      return slugSourceSql(postId, cursor, limit)
    case 'static':
      return staticSourceSql(postId, cursor, limit)
    default:
      return assertNever(branch, 'Unknown publication source branch')
  }
}

function topicSourceSql(
  branch: 'review' | 'data',
  postId: string,
  cursor: string | null,
  limit: number,
): SQLStatement {
  const statement = sourcePageHead(postId)
  statement.append(
    branch === 'review'
      ? 'SELECT topic_id FROM post_review_topic_ratings'
      : 'SELECT topic_id FROM post_data_point_topics',
  )
  statement
    .append(' CROSS JOIN native_bounds WHERE ')
    .append(nativeSourceRange('post_id', ['topic_id'], cursor === null ? null : [cursor]))
    .append(sql` ORDER BY post_id, topic_id LIMIT `)
    .append(publicationPageLimit(limit)).append(sql`)
      SELECT 'topic'::text AS kind, topic_id::text AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day, topic_id::text AS cursor FROM page ORDER BY topic_id`)
  return statement
}

function relationSourceSql(
  branch: 'relation' | 'alias_relation',
  postId: string,
  cursor: string | null,
  limit: number,
): SQLStatement {
  const statement = sourcePageHead(postId)
  statement.append(
    branch === 'relation'
      ? 'SELECT * FROM relation__post__category__topic'
      : 'SELECT * FROM relation__post__category__topic_alias',
  )
  statement
    .append(' CROSS JOIN native_bounds WHERE ')
    .append(nativeSourceRange('subject_id', ['object_id'], cursor === null ? null : [cursor]))
    .append(sql` ORDER BY subject_id, object_id LIMIT `)
    .append(publicationPageLimit(limit)).append(sql`)
      SELECT CASE WHEN page.deleted_at IS NULL `)
  statement.append(aliasRelationPredicate(branch))
  statement.append(sql`THEN 'topic' END AS kind, `)
  statement.append(branch === 'relation' ? 'page.object_id::text' : 'alias.topic_id::text')
  statement.append(
    sql` AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day, page.object_id::text AS cursor FROM page`,
  )
  statement.append(aliasRelationJoin(branch))
  statement.append(' ORDER BY page.object_id')
  return statement
}

function aliasSourceSql(postId: string, cursor: string | null, limit: number): SQLStatement {
  const statement = sourcePageHead(postId)
  statement
    .append(
      'SELECT topic_alias_id, source FROM post_topic_alias_sources CROSS JOIN native_bounds WHERE ',
    )
    .append(
      nativeSourceRange(
        'post_id',
        ['topic_alias_id', 'source'],
        cursor === null ? null : JSON.parse(cursor),
        1,
        FINITE_VALUES.post_topic_alias_source_types[0],
      ),
    )
  statement
    .append(sql` ORDER BY post_id, topic_alias_id, source LIMIT `)
    .append(publicationPageLimit(limit))
    .append(sql`) SELECT CASE WHEN alias.topic_id IS NOT NULL THEN 'topic' END AS kind,
      alias.topic_id::text AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day,
      jsonb_build_array(page.topic_alias_id::text, page.source)::text AS cursor FROM page LEFT JOIN topic_aliases alias ON alias.id = page.topic_alias_id ORDER BY page.topic_alias_id, page.source`)
  return statement
}

function slugSourceSql(postId: string, cursor: string | null, limit: number): SQLStatement {
  const statement = sourcePageHead(postId)
  statement
    .append('SELECT slug FROM post_slugs CROSS JOIN native_bounds WHERE ')
    .append('post_id = native_bounds.publication_scope_id')
  if (cursor !== null) statement.append(sql` AND slug > ${cursor}`)
  statement.append(sql` ORDER BY slug LIMIT ${limit}`).append(sql`)
      SELECT 'post_slug'::text AS kind, NULL::text AS "uuidValue", slug AS "textValue", NULL::text AS "postType", NULL::text AS day, slug AS cursor FROM page ORDER BY slug`)
  return statement
}

function staticSourceSql(postId: string, cursor: string | null, limit: number): SQLStatement {
  const statement = sourcePageHead(postId)
  statement
    .append(sql`SELECT * FROM posts WHERE id = ${postId}), root AS (SELECT posts.* FROM posts JOIN page ON posts.id = COALESCE(page.root_post_id, page.id)), keys AS (
      SELECT 'author'::text AS kind, page.created_by_id::text AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day, '1'::text AS cursor FROM page WHERE created_by_id IS NOT NULL
      UNION ALL SELECT 'author_username', NULL, username, NULL, NULL, '2' FROM users JOIN page ON users.id = page.created_by_id WHERE username IS NOT NULL
      UNION ALL SELECT 'community', community_id::text, NULL, NULL, NULL, '3' FROM page WHERE community_id IS NOT NULL
      UNION ALL SELECT 'community', community_id::text, NULL, NULL, NULL, '4' FROM root WHERE community_id IS NOT NULL
      UNION ALL SELECT 'community_slug', NULL, slug, NULL, NULL, '5' FROM communities JOIN page ON communities.id = page.community_id WHERE slug IS NOT NULL
      UNION ALL SELECT 'community_slug', NULL, slug, NULL, NULL, '6' FROM communities JOIN root ON communities.id = root.community_id WHERE slug IS NOT NULL
      UNION ALL SELECT 'sitemap_target', NULL, NULL, post_type::text, (created_at AT TIME ZONE 'UTC')::date::text, '7' FROM page WHERE post_type = ANY(${SITEMAP_CONFIG.POST_TYPES}::post_types[]))
      SELECT * FROM keys WHERE (${cursor}::text IS NULL OR cursor > ${cursor}) ORDER BY cursor LIMIT `)
    .append(publicationPageLimit(limit))
    .append(sql``)
  return statement
}

function aliasRelationPredicate(branch: 'relation' | 'alias_relation'): SQLStatement {
  switch (branch) {
    case 'relation':
      return sql``
    case 'alias_relation':
      return sql`AND page.votes_score_net > 0 AND alias.topic_id IS NOT NULL `
    default:
      return assertNever(branch, 'Unknown relation branch')
  }
}

function aliasRelationJoin(branch: 'relation' | 'alias_relation'): SQLStatement {
  switch (branch) {
    case 'relation':
      return sql``
    case 'alias_relation':
      return sql` LEFT JOIN topic_aliases alias ON alias.id = page.object_id`
    default:
      return assertNever(branch, 'Unknown relation branch')
  }
}
