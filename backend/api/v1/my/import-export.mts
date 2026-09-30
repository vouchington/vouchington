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
import { requireAuth } from '../../response-helpers.mts'
import { apiResponse } from '../../response-contract.mts'

const SYNC_EXPORT_TOO_LARGE_ERROR =
  'Export is too large for a synchronous download. Ask an administrator to adjust user-import-export-config.sync_export_max_items or retry after reducing followed items.'

app.route('/api/v1/my/export/rss-feeds').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/export/rss-feeds')

  const format = ctx.query.format as string | undefined
  const feedType = ctx.query.feed_type as string | undefined
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
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/export/topics')
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
