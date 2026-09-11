import type { TopicTypes } from '@services/topics'
import sql, { type SQLStatement } from 'sql-template-strings'

type RecommendationQueryFilterOptions = {
  id_gt?: string
  name_gt?: string
  rss_feed?: boolean
  score_lt?: number
  sort?: 'score' | 'best'
  spending_category?: boolean
  topic_types?: TopicTypes[]
}

export function appendRecommendationFilters(
  query: SQLStatement,
  {
    id_gt,
    name_gt,
    rss_feed,
    score_lt,
    sort,
    spending_category,
    topic_types,
  }: RecommendationQueryFilterOptions,
) {
  if (topic_types && topic_types.length > 0) {
    query.append(sql`
        AND t.topic_type = ANY(${topic_types})`)
  }

  if (spending_category) {
    query.append(sql`
        AND EXISTS (
          SELECT 1 FROM topics__spending_categories tsc
          WHERE tsc.topic_id = t.id
        )`)
  }

  if (rss_feed) {
    query.append(sql`
        AND EXISTS (
          SELECT 1 FROM rss_feeds rf
          WHERE rf.topic_id = t.id
            AND rf.deleted_at IS NULL
        )`)
  }

  appendRecommendationPagination(query, { id_gt, name_gt, score_lt, sort })
}

export function appendRecommendationSelectAndOrder(
  query: SQLStatement,
  limit: number,
  sort?: 'score' | 'best',
) {
  query.append(sql`
    )

    SELECT
      topic_id,
      total_score AS score,
      reasons AS reason`)

  if (sort === 'best') {
    query.append(sql`,
      name`)
  }

  query.append(sql`
    FROM filtered_recommendations`)

  if (sort === 'best') {
    query.append(sql`
    ORDER BY name ASC, topic_id ASC`)
  } else {
    query.append(sql`
    ORDER BY total_score DESC, topic_id ASC`)
  }

  query.append(sql`
    LIMIT ${limit}
  `)
}

function appendRecommendationPagination(
  query: SQLStatement,
  {
    id_gt,
    name_gt,
    score_lt,
    sort,
  }: Pick<RecommendationQueryFilterOptions, 'id_gt' | 'name_gt' | 'score_lt' | 'sort'>,
) {
  if (sort !== 'best' && score_lt !== undefined && id_gt !== undefined) {
    query.append(sql`
        AND (
          ar.total_score < ${score_lt}
          OR (ar.total_score = ${score_lt} AND ar.topic_id > ${id_gt})
        )`)
  }

  if (sort === 'best' && name_gt !== undefined && id_gt !== undefined) {
    query.append(sql`
        AND (
          t.name > ${name_gt}
          OR (t.name = ${name_gt} AND ar.topic_id > ${id_gt})
        )`)
  }
}
