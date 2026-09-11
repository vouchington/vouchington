import app from '../../app.mts'
import { Readable } from 'node:stream'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users/suspension'
import { parseCsvToUrls } from '@modules/csv'
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
import { parseOpmlOutlines } from '@services/user-import-export/opml'
import {
  getRssFeedImport,
  submitRssFeedImport,
} from '@services/user-import-export/rss-feed-imports'
import { enqueueBulkUserRssFeedImportRows } from '@queues/user-rss-feed-imports/enqueues'
import { isUUID } from '@modules/utils'
import { isAdminUser } from '@services/users'
import { SYNC_EXPORT_TOO_LARGE } from '@modules/on-error/error-codes'
import { apiResponse } from '../../response-contract.mts'

const MAX_IMPORT_ITEMS = 500
// Two MiB prevents abusive buffering before the 500-row cap can reject the import.
const MAX_OPML_IMPORT_BYTES = '2mb'
const SYNC_EXPORT_TOO_LARGE_ERROR =
  'Export is too large for a synchronous download. Ask an administrator to adjust user-import-export-config.sync_export_max_items or retry after reducing followed items.'

async function handleRssFeedImportRequest(ctx: Context, authKey: string) {
  const currentUser = await requireAuth(ctx, authKey)
  assertNotSuspended(currentUser)
  let urls: string[]
  let follow = !isAdminUser(currentUser)
  const body = await parseJsonBody<Record<string, unknown>>(ctx, MAX_OPML_IMPORT_BYTES)
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid JSON body',
  )
  ctx.assert(
    body.follow === undefined || typeof body.follow === 'boolean',
    400,
    'follow must be a boolean',
  )
  follow = typeof body.follow === 'boolean' ? body.follow : follow
  if ('opml' in body) {
    ctx.assert(typeof body.opml === 'string', 400, 'opml must be a string')
    urls = Array.from(parseOpmlOutlines(body.opml), o => o.xmlUrl)
  } else if ('csv' in body) {
    ctx.assert(typeof body.csv === 'string', 400, 'csv must be a string')
    let result: { urls: string[]; recognized: boolean }
    try {
      result = parseCsvToUrls(body.csv)
    } catch {
      ctx.throw(400, 'Invalid CSV format')
    }
    urls = result.recognized ? result.urls : parseTsvOrUrlList(body.csv)
  } else if ('urls' in body) {
    ctx.assert(Array.isArray(body.urls), 400, 'urls must be an array')
    urls = (body.urls as unknown[]).flatMap(u => {
      if (typeof u !== 'string') return []
      const trimmed = u.trim()
      return trimmed ? [trimmed] : []
    })
  } else {
    ctx.throw(400, 'Provide one of: opml (string), csv (string), or urls (array of strings)')
  }

  ctx.assert(urls.length > 0, 400, 'At least one URL is required')
  ctx.assert(urls.length <= MAX_IMPORT_ITEMS, 400, `Maximum ${MAX_IMPORT_ITEMS} URLs per import`)

  const submitted = await submitRssFeedImport(currentUser, urls, { follow })
  await enqueueBulkUserRssFeedImportRows(
    submitted.rowIds.map(rowId => ({ importId: submitted.import.id, rowId })),
  )

  const statusUrl = `/api/v1/my/import/rss-feeds/${submitted.import.id}`
  return { import: submitted.import, status_url: statusUrl }
}

app.route('/api/v1/my/import/rss-feeds').post(async (ctx: Context) => {
  const response = await handleRssFeedImportRequest(ctx, 'POST:/api/v1/my/import/rss-feeds')
  ctx.setStatus(201)
  ctx.set('Location', response.status_url)
  ctx.json(apiResponse('POST:/api/v1/my/import/rss-feeds', response))
})

app.route('/api/v1/my/import/rss-feeds/:importId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/import/rss-feeds/:importId')
  const importId = ctx.params.importId!
  ctx.assert(isUUID(importId), 400, 'Invalid import ID')

  const result = await getRssFeedImport(currentUser.id, importId)
  ctx.assert(result, 404, 'RSS feed import not found')
  ctx.json(result)
})

function parseTsvOrUrlList(text: string): string[] {
  const lines = text.split('\n').flatMap(line => {
    const trimmed = line.trim()
    return trimmed ? [trimmed] : []
  })
  if (lines.length === 0) return []

  const firstLine = lines[0]!
  const hasTabs = firstLine.includes('\t')

  if (hasTabs) {
    const headers = firstLine.toLowerCase().split('\t')
    const urlCol =
      headers.indexOf('xmlurl') !== -1 ? headers.indexOf('xmlurl') : headers.indexOf('url')
    if (urlCol === -1) return []
    return lines.slice(1).flatMap(line => {
      const val = line.split('\t')[urlCol] ?? ''
      return val ? [val] : []
    })
  }

  return lines
}

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
