import type { Context } from '@jongleberry/api-server'
import {
  createPaginationParser,
  decodeCursor,
  defineQueryContract,
  encodeCursor,
  queryEnum,
  queryString,
} from '@modules/pagination'
import { indexById, isUUID } from '@modules/utils'
import { attachTopicProvenance } from '@services/content-provenance'
import { getTopicByAnyCachedBatch } from '@services/entity-fetch'
import {
  searchTopHashtags,
  topHashtagsCursorScope,
  type TopHashtag,
  type TopHashtagCursor,
  type TopHashtagMapping,
} from '@services/topics'
import app from '../../../app.mts'
import { apiQuery } from '../../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../../validate-paginated-query.mts'
import { requireAuth } from '../../../response-helpers.mts'

const parser = createPaginationParser({
  cursor: { type: 'score' },
  limit: { min: 1, max: 100, default: 25 },
})
const filterQuery = defineQueryContract({
  q: queryString(),
  mapping: queryEnum(['all', 'linked', 'unlinked'] as const),
})

app.route('/api/v1/topic-recommendations/top-hashtags').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/topic-recommendations/top-hashtags', parser, filterQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/topic-recommendations/top-hashtags')
  const pagination = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/topic-recommendations/top-hashtags',
    parser,
    // A repeated `q` has always been ignored rather than rejected.
    {
      extraQueryContracts: [filterQuery.queryContract],
      ignoredKeys: typeof ctx.query.q === 'string' ? [] : ['q'],
    },
  )
  const q = typeof ctx.query.q === 'string' ? ctx.query.q : undefined
  const mapping = (ctx.query.mapping as TopHashtagMapping | undefined) ?? 'all'
  const scope = topHashtagsCursorScope({ q, mapping })
  const after = pagination.after ? decodeTopHashtagsCursor(ctx, pagination.after, scope) : undefined
  const { results, hasNextPage } = await searchTopHashtags({
    q,
    mapping,
    after,
    limit: pagination.limit,
  })
  const topicIds = results.flatMap(result => (result.topic_id ? [result.topic_id] : []))
  const topics = await getTopicByAnyCachedBatch(topicIds).then(found =>
    attachTopicProvenance(found, currentUser),
  )
  const publicResults: TopHashtag[] = results.map(
    ({ latest_content_at: _latestContentAt, ...result }) => result,
  )
  ctx.json({
    results: publicResults,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeTopHashtagsCursor(results[0], scope) : null,
      end_cursor:
        hasNextPage && results.at(-1) ? encodeTopHashtagsCursor(results.at(-1)!, scope) : null,
    },
    topics: indexById(topics.filter(Boolean)),
  })
})

function encodeTopHashtagsCursor(cursor: TopHashtagCursor, scope: string): string {
  return encodeCursor({
    item_count: cursor.item_count,
    latest_content_at:
      cursor.latest_content_at instanceof Date
        ? cursor.latest_content_at.toISOString()
        : cursor.latest_content_at,
    latest_content_id: cursor.latest_content_id,
    topic_alias_id: cursor.topic_alias_id,
    scope,
  } as never)
}

function decodeTopHashtagsCursor(ctx: Context, value: string, scope: string): TopHashtagCursor {
  const cursor = decodeCursor(value) as Record<string, unknown>
  ctx.assert(
    typeof cursor.item_count === 'number' &&
      Number.isSafeInteger(cursor.item_count) &&
      cursor.item_count >= 0 &&
      typeof cursor.latest_content_at === 'string' &&
      Number.isFinite(Date.parse(cursor.latest_content_at)) &&
      typeof cursor.latest_content_id === 'string' &&
      isUUID(cursor.latest_content_id) &&
      typeof cursor.topic_alias_id === 'string' &&
      isUUID(cursor.topic_alias_id) &&
      cursor.scope === scope,
    400,
    'Invalid cursor format',
  )
  return cursor as unknown as TopHashtagCursor
}
