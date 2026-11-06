import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'

export async function pagePostHackerNewsFlags(
  kind: 'own' | 'related',
  urlId: string,
  afterId: string,
  upperId: string,
  size: number,
  options: QueryOptions = {},
): Promise<string[]> {
  const statement =
    kind === 'own'
      ? `/* pageHackerNewsOwnUrlPosts */ SELECT id FROM posts WHERE url_id = $1 AND post_type = 'link' AND id > $2 AND id <= $4 ORDER BY id LIMIT $3`
      : `/* pageHackerNewsRelatedUrlPosts */ SELECT subject_id AS id FROM relation__post__related__url WHERE object_id = $1 AND deleted_at IS NULL AND votes_score_net > 0 AND subject_id > $2 AND subject_id <= $4 ORDER BY subject_id LIMIT $3`
  const page = await write<{ id: string }>(statement, [urlId, afterId, size, upperId], options)
  return page.rows.map(row => row.id)
}

export async function pagePostHackerNewsFlagRepair(afterId: string, upperId: string, size: number) {
  const page = await write<{ id: string }>(
    `/* pageHackerNewsPostFlagRepair */ SELECT id FROM posts WHERE id > $1 AND id <= $2 ORDER BY id LIMIT $3`,
    [afterId, upperId, size],
  )
  return page.rows.map(row => row.id)
}
