import { read } from '@data-stores/psql'
import { getTopicTypeSlug, topicTypes } from '@voucha/types/entities/topic'
import sql from 'sql-template-strings'
import { buildLandingPagesQuery } from './family-landing-pages-query.mts'
import type { SitemapFamilyEntry, SitemapFamilyType } from './types.mts'

type FamilyPageOptions = {
  highWaterId?: string
  afterId?: string
  afterPath?: string
  limit: number
}

function buildTopicSlugCaseSql() {
  const caseSql = sql`CASE topic_type`
  for (const topicType of Object.keys(topicTypes)) {
    caseSql.append(sql` WHEN ${topicType} THEN ${getTopicTypeSlug(topicType)}`)
  }
  caseSql.append(sql` ELSE topic_type::text END`)
  return caseSql
}

export async function readSitemapFamilyPage(
  family: SitemapFamilyType,
  options: FamilyPageOptions,
): Promise<SitemapFamilyEntry[]> {
  const statement = sql`/* readSitemapFamilyPage */ SELECT id, path, updated_at FROM (`
  statement.append(buildSitemapFamilyQuery(family, options)).append(sql`) AS entries WHERE TRUE`)
  if (options.afterId && options.afterPath) {
    statement.append(
      sql` AND (id < ${options.afterId} OR (id = ${options.afterId} AND path > ${options.afterPath}))`,
    )
  }
  statement.append(family === 'topics' ? sql` ORDER BY id DESC, path ASC` : sql` ORDER BY id DESC`)
  statement.append(sql` LIMIT ${options.limit}`)
  const { rows } = await read<SitemapFamilyEntry>(statement)
  return rows
}

function buildSitemapFamilyQuery(family: SitemapFamilyType, options: FamilyPageOptions) {
  switch (family) {
    case 'users':
      return buildUsersQuery(options)
    case 'topics':
      return buildTopicsQuery(options)
    case 'communities':
      return buildCommunitiesQuery(options)
    case 'domains':
      return buildDomainsQuery(options)
    case 'landing-pages':
      return buildLandingPagesQuery(options)
  }
}

function buildUsersQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapUsersQuery */
    SELECT id, CONCAT('/user/', username) AS path, updated_at
    FROM users
    WHERE deleted_at IS NULL
      AND username IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_suspensions us
        WHERE us.user_id = users.id
          AND us.lifted_at IS NULL
      )
  `
  return appendFamilyBounds(query, options)
}

function buildTopicsQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapTopicsQuery */
    SELECT topics.id, CONCAT('/', `
  query.append(buildTopicSlugCaseSql())
  query.append(sql`, '/', topics.slug, '/', pages.subpage) AS path, topics.updated_at
    FROM topics
    CROSS JOIN LATERAL (VALUES
      ('posts', TRUE),
      ('data-points', TRUE),
      ('latest', TRUE),
      ('news', TRUE),
      ('reviews', topics.should_allow_reviews IS TRUE),
      ('referral-links', topics.topic_type = 'referral_program' OR topics.referral_program_topic_id IS NOT NULL)
    ) AS pages(subpage, eligible)
    WHERE topics.deleted_at IS NULL
      AND topics.merged_into_topic_id IS NULL
      AND topics.is_noindexed IS NOT TRUE
      AND topics.slug IS NOT NULL
      AND topics.topic_type = ANY(${Object.keys(topicTypes)})
      AND pages.eligible
  `)
  if (options.highWaterId) query.append(sql` AND topics.id <= ${options.highWaterId}`)
  if (options.afterId) query.append(sql` AND topics.id <= ${options.afterId}`)
  return query
}

function buildCommunitiesQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapCommunitiesQuery */
    SELECT id, CONCAT('/communities/', slug) AS path, updated_at
    FROM communities
    WHERE deleted_at IS NULL
      AND visibility = 'public'
  `
  return appendFamilyBounds(query, options)
}

function buildDomainsQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapDomainsQuery */
    SELECT id, CONCAT('/domain/', hostname) AS path, updated_at
    FROM url_hostnames
    WHERE NOT is_blocked
      AND publicly_introduced_at IS NOT NULL
      AND votes_count_up > 0
  `
  return appendFamilyBounds(query, options)
}

function appendFamilyBounds<T extends ReturnType<typeof sql>>(
  query: T,
  options: FamilyPageOptions,
): T {
  if (options.highWaterId) query.append(sql` AND id <= ${options.highWaterId}`)
  if (options.afterId) {
    query.append(sql` AND id < ${options.afterId}`)
  }
  return query
}
