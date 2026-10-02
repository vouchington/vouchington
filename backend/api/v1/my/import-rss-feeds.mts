import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users/suspension'
import { parseCsvToUrls } from '@modules/csv'
import { parseOpmlOutlines } from '@services/user-import-export/opml'
import {
  getRssFeedImport,
  submitRssFeedImport,
} from '@services/user-import-export/rss-feed-imports'
import { enqueueBulkUserRssFeedImportRows } from '@queues/user-rss-feed-imports/enqueues'
import { isUUID } from '@modules/utils'
import { isAdminUser } from '@services/users'
import { apiResponse } from '../../response-contract.mts'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

const MAX_IMPORT_ITEMS = 500
// Two MiB prevents abusive buffering before the 500-row cap can reject the import.
const MAX_OPML_IMPORT_BYTES = '2mb'

type ImportRssFeedsRequest =
  | { opml: string; follow?: boolean }
  | { csv: string; follow?: boolean }
  | { urls: string[]; follow?: boolean }

function parseImportUrls(ctx: Context, body: ImportRssFeedsRequest): string[] {
  if ('opml' in body) return Array.from(parseOpmlOutlines(body.opml), o => o.xmlUrl)
  if ('csv' in body) {
    let result: { urls: string[]; recognized: boolean }
    try {
      result = parseCsvToUrls(body.csv)
    } catch {
      ctx.throw(400, 'Invalid CSV format')
    }
    return result.recognized ? result.urls : parseTsvOrUrlList(body.csv)
  }
  return body.urls.flatMap(u => {
    const trimmed = u.trim()
    return trimmed ? [trimmed] : []
  })
}

app.route('/api/v1/my/import/rss-feeds').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/import/rss-feeds')
  const provenance = getRequestContentProvenance()
  assertNotSuspended(currentUser)

  const body = await parseJsonBody<ImportRssFeedsRequest>(ctx, MAX_OPML_IMPORT_BYTES)
  validateRequestContract(ctx, 'POST:/api/v1/my/import/rss-feeds', { body })

  const follow = body.follow ?? !isAdminUser(currentUser)
  // The schema fixes which source key is present and its type; counts are semantic checks.
  const urls = parseImportUrls(ctx, body)
  ctx.assert(urls.length > 0, 400, 'At least one URL is required')
  ctx.assert(urls.length <= MAX_IMPORT_ITEMS, 400, `Maximum ${MAX_IMPORT_ITEMS} URLs per import`)

  const submitted = await submitRssFeedImport(currentUser, provenance, urls, { follow })
  await enqueueBulkUserRssFeedImportRows(
    submitted.rowIds.map(rowId => ({ importId: submitted.import.id, rowId })),
  )

  const statusUrl = `/api/v1/my/import/rss-feeds/${submitted.import.id}`
  ctx.setStatus(201)
  ctx.set('Location', statusUrl)
  ctx.json(
    apiResponse('POST:/api/v1/my/import/rss-feeds', {
      import: submitted.import,
      status_url: statusUrl,
    }),
  )
})

app.route('/api/v1/my/import/rss-feeds/:importId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/import/rss-feeds/:importId')
  validateRequestContract(ctx, 'GET:/api/v1/my/import/rss-feeds/:importId', { path: ctx.params })
  // The path schema is a plain string, so the UUID format is checked here.
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
    const urlCol = headers.includes('xmlurl') ? headers.indexOf('xmlurl') : headers.indexOf('url')
    if (urlCol === -1) return []
    return lines.slice(1).flatMap(line => {
      const val = line.split('\t')[urlCol] ?? ''
      return val ? [val] : []
    })
  }

  return lines
}
