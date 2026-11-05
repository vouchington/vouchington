import { read } from '@data-stores/psql'
import { getTopicTypeSlug, topicTypes } from '@voucha/types/entities/topic'
import sql from 'sql-template-strings'
import {
  buildLandingPageSourceQuery,
  buildLandingPagesQuery,
} from './family-landing-pages-query.mts'
import type { SitemapSourcePage } from './generation-page-types.mts'
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

export async function readLandingSitemapSourcePage(
  options: FamilyPageOptions,
): Promise<SitemapSourcePage<SitemapFamilyEntry>> {
  const { rows } = await read<SitemapFamilyEntry & { kept: boolean }>(
    buildLandingPageSourceQuery(options),
  )
  if (rows.length > options.limit) throw new Error('Sitemap source exceeded its query limit')
  const exhausted = rows.length < options.limit
  const inspected = exhausted ? rows : rows.slice(0, options.limit - 1)
  const last = inspected.at(-1)
  return {
    entries: inspected.flatMap(row =>
      row.kept && row.path ? [{ id: row.id, path: row.path, updated_at: row.updated_at }] : [],
    ),
    exhausted,
    afterId: last?.id ?? null,
    afterPath: null,
    boundId: rows[0]?.id ?? null,
  }
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
  statement.append(sql` ORDER BY id DESC, path ASC LIMIT ${options.limit}`)
  const { rows } = await read(statement)
  return rows as SitemapFamilyEntry[]
}

// oxlint-disable-next-line typescript/consistent-return -- Typed family switch is exhaustive; Oxlint misses its terminal flow.
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
  return appendFamilyBounds(query, options, false)
}

function buildTopicsQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapTopicsQuery */
    WITH eligible_topics AS (
      SELECT
        id,
        slug,
        topic_type,
        should_allow_reviews,
        referral_program_topic_id,
        updated_at
      FROM topics
      WHERE deleted_at IS NULL
        AND merged_into_topic_id IS NULL
        AND is_noindexed IS NOT TRUE
        AND slug IS NOT NULL
        AND topic_type = ANY(${Object.keys(topicTypes)})
  `
  appendFamilyBounds(query, options, true)
  query.append(sql`)
    SELECT id, CONCAT('/', slug_path, '/', slug, '/', subpage) AS path, updated_at
    FROM (
      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'posts' AS subpage, id
      FROM eligible_topics

      UNION ALL

      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'data-points' AS subpage, id
      FROM eligible_topics

      UNION ALL

      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'latest' AS subpage, id
      FROM eligible_topics

      UNION ALL

      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'news' AS subpage, id
      FROM eligible_topics

      UNION ALL

      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'reviews' AS subpage, id
      FROM eligible_topics
      WHERE should_allow_reviews IS TRUE

      UNION ALL

      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'referral-links' AS subpage, id
      FROM eligible_topics
      WHERE topic_type = 'referral_program' OR referral_program_topic_id IS NOT NULL
    ) entries
  `)
  return query
}

function buildCommunitiesQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapCommunitiesQuery */
    SELECT id, CONCAT('/communities/', slug) AS path, updated_at
    FROM communities
    WHERE deleted_at IS NULL
      AND visibility = 'public'
  `
  return appendFamilyBounds(query, options, false)
}

function buildDomainsQuery(options: FamilyPageOptions) {
  const query = sql`/* buildSitemapDomainsQuery */
    SELECT id, CONCAT('/domain/', hostname) AS path, updated_at
    FROM url_hostnames
    WHERE NOT is_blocked
      AND publicly_introduced_at IS NOT NULL
      AND votes_count_up > 0
  `
  return appendFamilyBounds(query, options, false)
}

function appendFamilyBounds<T extends ReturnType<typeof sql>>(
  query: T,
  options: FamilyPageOptions,
  includeSameId: boolean,
): T {
  if (options.highWaterId) query.append(sql` AND id <= ${options.highWaterId}`)
  if (options.afterId) {
    if (includeSameId) query.append(sql` AND id <= ${options.afterId}`)
    else query.append(sql` AND id < ${options.afterId}`)
  }
  query.append(
    sql` ORDER BY id DESC LIMIT ${options.limit + (includeSameId && options.afterId ? 1 : 0)}`,
  )
  return query
}
