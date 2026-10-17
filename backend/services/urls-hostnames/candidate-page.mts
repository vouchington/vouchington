import { read } from '@data-stores/psql'
import { buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { ViewHostname } from './types.mts'

type CandidateOrder = 'score' | 'hostname'

export async function readHostnameCandidatePage({
  filters,
  values,
  limit,
  order,
}: {
  filters: string[]
  values: unknown[]
  limit: number
  order: CandidateOrder
}): Promise<{ results: ViewHostname[]; page_info: PageInfo }> {
  const sort =
    order === 'score'
      ? { column: 'votes_score_net', direction: 'DESC' }
      : { column: 'hostname', direction: 'ASC' }
  values.push(limit + 1)
  const { rows } = await read(
    `/* readHostnameCandidatePage */
    WITH candidate_hostnames AS MATERIALIZED (
      SELECT id, ${sort.column} FROM url_hostnames
      WHERE ${filters.join(' AND ')}
      ORDER BY ${sort.column} ${sort.direction}, id ${sort.direction}
      LIMIT $${values.length}
    )
    SELECT hydrated.* FROM candidate_hostnames candidate
    JOIN LATERAL (
      SELECT * FROM view_url_hostnames WHERE id = candidate.id LIMIT 1
    ) hydrated ON true
    ORDER BY candidate.${sort.column} ${sort.direction}, candidate.id ${sort.direction}`,
    values,
  )

  const all = rows as ViewHostname[]
  const results = all.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: all.length > limit,
      getCursor:
        order === 'score'
          ? h => ({ score: h.votes_score_net, id: h.id })
          : h => ({ name: h.hostname, id: h.id }),
    }),
  }
}
