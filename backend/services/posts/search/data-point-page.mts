import { read } from '@data-stores/psql'
import { getPostsWorkLimit } from '@services/posts/work-limits'
import { assembleDataPointPage, type RawDataPointRow } from './data-point-assemble.mts'
import { decodeDataPointCursor } from './data-point-cursor.mts'
import { buildDataPointPageQuery } from './data-point-query.mts'
import type { DataPointSearchPage, SearchDataPointsOptions } from './data-point-types.mts'

export type { DataPointSearchPage, SearchDataPointsOptions } from './data-point-types.mts'

/**
 * Data-point search reads community-less posts first, then a keyset page of
 * live public communities and a bounded child slice from each. Optional filters
 * sit outside that limit, same as publication eligibility, and may shorten the page.
 */
export async function searchDataPoints(
  options: SearchDataPointsOptions,
): Promise<DataPointSearchPage> {
  const limit = Math.min(options.limit ?? 25, 25)
  const cursor = decodeDataPointCursor(options.after)
  const pageSize = getPostsWorkLimit('data_point_community_page_size')
  const childLimit = getPostsWorkLimit('data_point_child_limit')
  const query = buildDataPointPageQuery(options, cursor, pageSize, childLimit)
  const { rows } = await read(query)
  return assembleDataPointPage(rows as RawDataPointRow[], { limit, childLimit })
}
