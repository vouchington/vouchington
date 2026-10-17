import { decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { ViewHostname } from './types.mts'
import { readHostnameCandidatePage } from './candidate-page.mts'

export type SearchTopHostnamesOptions = {
  limit?: number
  after?: string
  topic_id?: string
  includePrivate?: boolean
}

export async function searchTopHostnames(
  options: SearchTopHostnamesOptions = {},
): Promise<{ results: ViewHostname[]; page_info: PageInfo }> {
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(options.limit) ? (options.limit as number) : 25),
  )
  const values: unknown[] = []
  const filters: string[] = ['NOT is_blocked', 'votes_count_up > 0']
  if (!options.includePrivate) filters.push('publicly_introduced_at IS NOT NULL')

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

  return readHostnameCandidatePage({ filters, values, limit, order: 'score' })
}
