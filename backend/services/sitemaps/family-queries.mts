import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { getTopicTypeSlug, topicTypes } from '@voucha/types/entities/topic'
import sql from 'sql-template-strings'
import { buildLandingPagesQuery } from './family-landing-pages-query.mts'
import type { SitemapFamilyEntry, SitemapFamilyType } from './types.mts'

function buildTopicSlugCaseSql() {
  const caseSql = sql`CASE topic_type`
  for (const topicType of Object.keys(topicTypes)) {
    caseSql.append(sql` WHEN ${topicType} THEN ${getTopicTypeSlug(topicType)}`)
  }
  caseSql.append(sql` ELSE topic_type::text END`)
  return caseSql
}

export function iterateSitemapFamilyEntries(
  family: SitemapFamilyType,
): AsyncIterable<SitemapFamilyEntry> {
  const statement = sql`/* iterateSitemapFamilyEntries */`
  statement.append(buildSitemapFamilyQuery(family))
  return createAsyncGeneratorFromCursor<SitemapFamilyEntry>(statement)
}

export function buildSitemapFamilyQuery(family: SitemapFamilyType) {
  switch (family) {
    case 'users':
      return buildUsersQuery()
    case 'topics':
      return buildTopicsQuery()
    case 'communities':
      return buildCommunitiesQuery()
    case 'domains':
      return buildDomainsQuery()
    case 'landing-pages':
      return buildLandingPagesQuery()
  }
}

function buildUsersQuery() {
  return sql`/* buildSitemapUsersQuery */
    SELECT CONCAT('/user/', username) AS path, updated_at
    FROM users
    WHERE deleted_at IS NULL
      AND username IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_suspensions us
        WHERE us.user_id = users.id
          AND us.lifted_at IS NULL
      )
    ORDER BY id DESC
  `
}

function buildTopicsQuery() {
  const query = sql`/* buildSitemapTopicsQuery */
    WITH eligible_topics AS (
      SELECT
        id,
        slug,
        topic_type,
        allow_reviews,
        referral_program_id,
        updated_at
      FROM topics
      WHERE deleted_at IS NULL
        AND merged_into_topic_id IS NULL
        AND noindex IS NOT TRUE
        AND slug IS NOT NULL
        AND topic_type = ANY(${Object.keys(topicTypes)})
    )
    SELECT CONCAT('/', slug_path, '/', slug, '/', subpage) AS path, updated_at
    FROM (
      SELECT `
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
      WHERE allow_reviews IS TRUE

      UNION ALL

      SELECT `)
  query.append(buildTopicSlugCaseSql())
  query.append(sql` AS slug_path, slug, updated_at, 'referral-links' AS subpage, id
      FROM eligible_topics
      WHERE topic_type = 'referral_program' OR referral_program_id IS NOT NULL
    ) entries
    ORDER BY id DESC, subpage ASC
  `)
  return query
}

function buildCommunitiesQuery() {
  return sql`/* buildSitemapCommunitiesQuery */
    SELECT CONCAT('/communities/', slug) AS path, updated_at
    FROM communities
    WHERE deleted_at IS NULL
      AND visibility = 'public'
    ORDER BY id DESC
  `
}

function buildDomainsQuery() {
  return sql`/* buildSitemapDomainsQuery */
    SELECT CONCAT('/domain/', hostname) AS path, updated_at
    FROM url_hostnames
    WHERE blocked IS NOT TRUE
      AND votes_count_up > 0
    ORDER BY votes_score_net DESC, id DESC
  `
}
