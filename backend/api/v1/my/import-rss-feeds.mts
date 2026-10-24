import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody, validateRequestContract } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users/suspension'
import { parseCsvToUrls } from '@modules/csv'
import { parseOpmlOutlines } from '@services/user-import-export/opml'
import {
  getRssFeedImport,
  rssFeedImportStatusPagination,
  submitAndDispatchRssFeedImport,
} from '@services/user-import-export/rss-feed-imports'
import { getUserImportExportConfig } from '@services/user-import-export/config'
import { isUUID } from '@modules/utils'
import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { apiResponse } from '@vouchington/utils/api-response-contract'
import { apiQuery } from '../../api-query-contract.mts'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

type ImportRssFeedsRequest =
  | { opml: string; should_follow_imported_feeds?: boolean }
  | { csv: string; should_follow_imported_feeds?: boolean }
  | { urls: string[]; should_follow_imported_feeds?: boolean }

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

  const body = await parseJsonBody<ImportRssFeedsRequest>(
    ctx,
    // OPML and CSV stay bounded by this byte cap. `{ urls }` also has its contract list cap. The
    // cap is read per request so an operator's change applies at once.
    `${getUserImportExportConfig().import_max_body_bytes}b`,
  )
  validateRequestContract(ctx, 'POST:/api/v1/my/import/rss-feeds', { body })

  // The schema fixes which source key is present and its type; counts are semantic checks.
  const urls = parseImportUrls(ctx, body)
  ctx.assert(urls.length > 0, 400, 'At least one URL is required')
  ctx.assert(urls.length <= 500, 422, 'No more than 500 URLs may be imported')

  const submitted = await submitAndDispatchRssFeedImport(currentUser, provenance, urls, {
    should_follow_imported_feeds: body.should_follow_imported_feeds,
  })
  ctx.setStatus(201)
  ctx.set('Location', submitted.status_url)
  ctx.json(apiResponse('POST:/api/v1/my/import/rss-feeds', submitted))
})

app.route('/api/v1/my/import/rss-feeds/:importId').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/import/rss-feeds/:importId', rssFeedImportStatusPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/import/rss-feeds/:importId')
  const page = parseRuntimePagination(rssFeedImportStatusPagination, ctx.query)
  const query = prepareQueryForValidation(ctx.query, rssFeedImportStatusPagination.queryContract)
  if (ctx.query.limit !== undefined) query.limit = page.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/import/rss-feeds/:importId', {
    path: ctx.params,
    query,
  })
  // The path schema is a plain string, so the UUID format is checked here.
  const importId = ctx.params.importId!
  ctx.assert(isUUID(importId), 400, 'Invalid import ID')

  const result = await getRssFeedImport(currentUser.id, importId, {
    limit: ctx.query.limit === undefined ? undefined : page.limit,
    after: page.after,
  })
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
