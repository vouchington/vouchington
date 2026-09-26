import { listFeedRows } from './identity-feed-paging.mts'
import { publicationPageLimit } from './page-limit.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { PublicationSnapshotKey } from './identity-source.mts'
import { nativeSourceBounds, nativeSourceRange } from './native-source-range.mts'

const branches = [
  'review',
  'data',
  'relation',
  'alias_source',
  'alias_relation',
  'static',
  'slug',
  'feed',
] as const
export type SourceRow = Omit<PublicationSnapshotKey, 'kind'> & {
  cursor: string
  kind: PublicationSnapshotKey['kind'] | null
}
export type PublicationIdentitySourcePage = {
  keys: PublicationSnapshotKey[]
  cursorKind: string | null
  cursorValue: string | null
  complete: boolean
}

/** Native source progress is independent of emitted identities, including duplicates and null mappings. */
export async function listPublicationIdentitySourcePage(
  query: TransactionQuery,
  postId: string,
  cursorKind: string | null,
  initialCursorValue: string | null,
  limit: number,
): Promise<PublicationIdentitySourcePage> {
  publicationPageLimit(limit)
  const keys: PublicationSnapshotKey[] = []
  let cursorValue = initialCursorValue
  let branchIndex =
    cursorKind === null ? 0 : branches.indexOf(cursorKind as (typeof branches)[number])
  if (branchIndex < 0) throw new TypeError('Invalid publication identity source branch')
  let remaining = limit
  while (branchIndex < branches.length && remaining > 0) {
    const branch = branches[branchIndex]!
    // oxlint-disable-next-line no-await-in-loop -- consume bounded native rows before progressing a source branch.
    const rows = await listSourceRows(query, branch, postId, cursorValue, remaining)
    for (const row of rows) {
      if (row.kind !== null)
        keys.push({
          kind: row.kind,
          uuidValue: row.uuidValue,
          textValue: row.textValue,
          postType: row.postType,
          day: row.day,
        })
    }
    const exhausted = rows.length < remaining
    remaining -= rows.length
    if (rows.length === 0 || (branch !== 'feed' && exhausted)) {
      branchIndex += 1
      cursorValue = null
    } else cursorValue = rows.at(-1)!.cursor
  }
  return {
    keys,
    cursorKind: branches[branchIndex] ?? null,
    cursorValue,
    complete: branchIndex === branches.length,
  }
}

async function listSourceRows(
  query: TransactionQuery,
  branch: (typeof branches)[number],
  postId: string,
  cursorValue: string | null,
  limit: number,
): Promise<SourceRow[]> {
  if (branch === 'feed') return await listFeedRows(query, postId, cursorValue, limit)
  return (await query<SourceRow>(sourceBranchSql(branch, postId, cursorValue, limit))).rows
}

function sourceBranchSql(
  branch: Exclude<(typeof branches)[number], 'feed'>,
  postId: string,
  cursor: string | null,
  limit: number,
): SQLStatement {
  const statement = sql`/* listPostPublicationIdentityNativeSourcePage */ WITH `
    .append(nativeSourceBounds(postId))
    .append(sql`, page AS MATERIALIZED (`)
  if (branch === 'review' || branch === 'data') {
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
  } else if (branch === 'relation' || branch === 'alias_relation') {
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
    if (branch === 'alias_relation')
      statement.append('AND page.votes_score_net > 0 AND alias.topic_id IS NOT NULL ')
    statement.append(sql`THEN 'topic' END AS kind, `)
    statement.append(branch === 'relation' ? 'page.object_id::text' : 'alias.topic_id::text')
    statement.append(
      sql` AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day, page.object_id::text AS cursor FROM page`,
    )
    if (branch === 'alias_relation')
      statement.append(' LEFT JOIN topic_aliases alias ON alias.id = page.object_id')
    statement.append(' ORDER BY page.object_id')
  } else if (branch === 'alias_source') {
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
        ),
      )
    statement
      .append(sql` ORDER BY post_id, topic_alias_id, source LIMIT `)
      .append(publicationPageLimit(limit))
      .append(sql`) SELECT CASE WHEN alias.topic_id IS NOT NULL THEN 'topic' END AS kind,
      alias.topic_id::text AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day,
      jsonb_build_array(page.topic_alias_id::text, page.source)::text AS cursor FROM page LEFT JOIN topic_aliases alias ON alias.id = page.topic_alias_id ORDER BY page.topic_alias_id, page.source`)
  } else if (branch === 'slug') {
    statement
      .append('SELECT slug FROM post_slugs CROSS JOIN native_bounds WHERE ')
      .append(nativeSourceRange('post_id', ['slug'], cursor === null ? null : [cursor], 0))
      .append(sql` ORDER BY post_id, slug LIMIT `)
      .append(publicationPageLimit(limit)).append(sql`)
      SELECT 'post_slug'::text AS kind, NULL::text AS "uuidValue", slug AS "textValue", NULL::text AS "postType", NULL::text AS day, slug AS cursor FROM page ORDER BY slug`)
  } else {
    statement
      .append(sql`SELECT * FROM posts WHERE id = ${postId}), root AS (SELECT posts.* FROM posts JOIN page ON posts.id = COALESCE(page.root_id, page.id)), keys AS (
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
  }
  return statement
}
