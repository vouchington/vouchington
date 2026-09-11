import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { ViewHostname } from './types.mts'

export type SearchTopHostnamesOptions = {
  limit?: number
  after?: string
  topic_id?: string
}

export async function searchTopHostnames(
  options: SearchTopHostnamesOptions = {},
): Promise<{ results: ViewHostname[]; page_info: PageInfo }> {
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(options.limit) ? (options.limit as number) : 25),
  )
  const values: unknown[] = []
  const filters: string[] = ['blocked IS NOT TRUE', 'votes_count_up > 0']

  if (options.topic_id) {
    filters.push(`topic_id = $${values.push(options.topic_id)}`)
  }

  if (options.after) {
    const cursor = decodeUuidCursor(
      options.after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    const scoreIdx = values.push(cursor.score)
    const idIdx = values.push(cursor.id)
    filters.push(
      `(votes_score_net < $${scoreIdx} OR (votes_score_net = $${scoreIdx} AND id < $${idIdx}))`,
    )
  }

  const where = `WHERE ${filters.join(' AND ')}`
  values.push(limit + 1)

  const { rows } = await read(
    `/* searchTopHostnames */
    SELECT * FROM view_url_hostnames
    ${where}
    ORDER BY votes_score_net DESC, id DESC
    LIMIT $${values.length}`,
    values,
  )

  const all = rows as ViewHostname[]
  const hasNextPage = all.length > limit
  const results = all.slice(0, limit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: h => ({ score: h.votes_score_net, id: h.id }),
    }),
  }
}
