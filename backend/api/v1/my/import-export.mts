import app from '../../app.mts'
import { Readable } from 'node:stream'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  streamUserRssFeeds,
  streamUserRssFeedsAsCsv,
  streamUserRssFeedsAsOpml,
  type ExportRssFeed,
  userRssFeedExportExceedsLimit,
} from '@services/user-import-export/export-rss-feeds'
import { getUserImportExportConfig } from '@services/user-import-export/config'
import {
  streamUserTopics,
  streamUserTopicsAsJsonArray as streamTopicsJson,
  type ExportTopic,
  userTopicExportExceedsLimit,
} from '@services/user-import-export/export-topics'
import { SYNC_EXPORT_TOO_LARGE } from '@modules/on-error/error-codes'
import { defineQueryContract, queryEnum, queryString } from '@modules/pagination'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'

const SYNC_EXPORT_TOO_LARGE_ERROR =
  'Export is too large for a synchronous download. Ask an administrator to adjust user-import-export-config.sync_export_max_items or retry after reducing followed items.'

const PREFLIGHT = queryEnum(['1'], {
  description: 'Only the literal 1 answers 204 without a body when the export fits the limit.',
})

// The export reads its query leniently: any format other than json or csv exports OPML, and any
// preflight other than the literal 1 exports. The handler validates the values it settled on, so
// this contract publishes the accepted shape without rejecting input. `feed_type` is published as a
// string: the service casts it to the feed type enum, so a value outside article, podcast, video and
// mixed still fails there, unchanged.
const rssFeedsExportQuery = defineQueryContract({
  feed_type: queryString({
    description:
      'Only export feeds of this type: article, podcast, video or mixed. An empty value means no filter.',
  }),
  format: queryEnum(['json', 'csv', 'opml'], {
    description: 'Any value other than json or csv exports opml.',
    default: 'opml',
  }),
  preflight: PREFLIGHT,
})

const topicsExportQuery = defineQueryContract({
  download: queryEnum(['1'], {
    description: 'Only the literal 1 streams the bare JSON array instead of a results object.',
  }),
  preflight: PREFLIGHT,
})

app.route('/api/v1/my/export/rss-feeds').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/export/rss-feeds', rssFeedsExportQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/export/rss-feeds')

  const format =
    ctx.query.format === 'json' || ctx.query.format === 'csv' ? ctx.query.format : 'opml'
  const feedType = ctx.query.feed_type as string | undefined
  validateRequestContract(ctx, 'GET:/api/v1/my/export/rss-feeds', {
    query: {
      format,
      ...(typeof feedType === 'string' && feedType !== '' ? { feed_type: feedType } : {}),
      ...(ctx.query.preflight === '1' ? { preflight: '1' } : {}),
    },
  })
  const { sync_export_max_items } = getUserImportExportConfig()
  const exceedsMaxItems = await userRssFeedExportExceedsLimit(
    currentUser.id,
    sync_export_max_items,
    feedType,
  )
  assertSyncExportWithinLimit(ctx, exceedsMaxItems)
  if (finishExportPreflight(ctx)) return
  const streamFeeds = () => streamUserRssFeeds(currentUser.id, sync_export_max_items, feedType)

  if (format === 'json') {
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.set('Content-Disposition', 'attachment; filename="rss-feeds.json"')
    const streamedResults = Readable.from(streamFeeds()) as unknown as ExportRssFeed[]
    await ctx.pipeline(streamJsonObject({ results: streamedResults }))
    return
  }

  if (format === 'csv') {
    ctx.set('Content-Type', 'text/csv; charset=utf-8')
    ctx.set('Content-Disposition', 'attachment; filename="rss-feeds.csv"')
    await ctx.pipeline(Readable.from(streamUserRssFeedsAsCsv(streamFeeds())))
    return
  }

  ctx.set('Content-Type', 'application/xml; charset=utf-8')
  ctx.set('Content-Disposition', 'attachment; filename="rss-feeds.opml"')
  await ctx.pipeline(Readable.from(streamUserRssFeedsAsOpml(streamFeeds())))
})

app.route('/api/v1/my/export/topics').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/export/topics', topicsExportQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/export/topics')
  validateRequestContract(ctx, 'GET:/api/v1/my/export/topics', {
    query: {
      ...(ctx.query.download === '1' ? { download: '1' } : {}),
      ...(ctx.query.preflight === '1' ? { preflight: '1' } : {}),
    },
  })
  const { sync_export_max_items } = getUserImportExportConfig()
  const exceedsMaxItems = await userTopicExportExceedsLimit(currentUser.id, sync_export_max_items)
  assertSyncExportWithinLimit(ctx, exceedsMaxItems)
  if (finishExportPreflight(ctx)) return
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.set('Content-Disposition', 'attachment; filename="topics.json"')
  if (ctx.query.download === '1') {
    const download = Readable.from(
      streamTopicsJson(currentUser.id, sync_export_max_items),
    ) as unknown as ExportTopic[]
    await ctx.pipeline(
      apiResponse('GET:/api/v1/my/export/topics#download', download) as unknown as Readable,
    )
    return
  }
  const results = Readable.from(
    streamUserTopics(currentUser.id, sync_export_max_items),
  ) as unknown as ExportTopic[]
  await ctx.pipeline(
    streamJsonObject(apiResponse('GET:/api/v1/my/export/topics#default', { results })),
  )
})

function assertSyncExportWithinLimit(ctx: Context, exceededMaxItems: boolean): void {
  if (exceededMaxItems) ctx.throw(413, SYNC_EXPORT_TOO_LARGE_ERROR, SYNC_EXPORT_TOO_LARGE)
}

function finishExportPreflight(ctx: Context): boolean {
  if (ctx.query.preflight !== '1') return false
  ctx.setStatus(204)
  return true
}
