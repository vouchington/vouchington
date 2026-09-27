import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'

export type SearchDataPointsOptions = {
  topic_id?: string
  vertical?: string
  result?: string
  credit_score_range?: string
  limit?: number
}

export type DataPointSearchResult = {
  id: string
  title: string
  data_point_vertical: string | null
  structured_data: Record<string, unknown>
}

export async function searchDataPoints(
  options: SearchDataPointsOptions,
): Promise<DataPointSearchResult[]> {
  const limit = Math.min(options.limit ?? 25, 25)

  const query = sql`/* searchDataPoints */
    SELECT
      posts.id,
      posts.title,
      posts.data_point_vertical,
      fn_post_structured_data(posts.id) AS structured_data
    FROM posts
    JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
    LEFT JOIN post_data_point_facts facts ON facts.post_id = posts.id
    WHERE posts.post_type = 'data_point'
      AND `
  query.append(buildPublicPostEligibilityFilter('posts', 'root_post'))

  if (options.topic_id) {
    query.append(
      sql` AND EXISTS (SELECT 1 FROM post_data_point_topics pdpt WHERE pdpt.post_id = posts.id AND pdpt.topic_id = ${options.topic_id})`,
    )
  }

  if (options.vertical) {
    query.append(sql` AND posts.data_point_vertical = ${options.vertical}`)
  }

  if (options.result) {
    query.append(sql` AND facts.result = ${options.result}`)
  }

  if (options.credit_score_range) {
    query.append(
      sql` AND facts.credit_score_range_presence = 'present' AND facts.credit_score_range = ${options.credit_score_range}`,
    )
  }

  query.append(sql` ORDER BY posts.id DESC LIMIT ${limit}`)

  const { rows } = await read(query)
  return rows as DataPointSearchResult[]
}
