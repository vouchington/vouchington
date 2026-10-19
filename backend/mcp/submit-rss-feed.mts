import createHttpError from 'http-errors'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { isUUID } from '@modules/utils'
import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import {
  getRssFeedImport,
  rssFeedImportStatusPagination,
  submitAndDispatchRssFeedImport,
} from '@services/user-import-export/rss-feed-imports'
import { submitRssFeedSource } from '@services/user-import-export/submit-rss-feed-source'
import { parseCreateSourceBody } from '@services/rss-feeds/request-body'
import type {
  ToolApiEndpoint,
  ToolMeta,
  ToolOutputSchema,
} from '@services/openai-agents/tool-types'
import { createMergedTool, type MergedToolSource } from './create-merged-tool.mts'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { routeResponseSchema } from './route-response-schema.mts'

const SUBMIT_ROUTE = {
  method: 'POST',
  path: '/api/v1/rss-feeds',
} as const satisfies ToolApiEndpoint
const IMPORT_ROUTE = {
  method: 'POST',
  path: '/api/v1/my/import/rss-feeds',
} as const satisfies ToolApiEndpoint
const STATUS_ROUTE = {
  method: 'GET',
  path: '/api/v1/my/import/rss-feeds/:importId',
} as const satisfies ToolApiEndpoint

function rssFeedMeta(api: readonly ToolApiEndpoint[], outputSchema: ToolOutputSchema): ToolMeta {
  return {
    audience: 'user',
    title: 'Submit RSS Feed',
    plan: 'plus',
    requiredScopes: ['rss-feeds:read', 'rss-feeds:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [...api],
    outputSchema,
  }
}

type SubmitArgs = { rss_feed_url: string; follow?: boolean }
const submitSource: MergedToolSource<
  SubmitArgs,
  Awaited<ReturnType<typeof submitRssFeedSource>>
> = {
  schema: {
    description:
      'Submit a feed URL for asynchronous processing. Poll status_url for the result. Follow defaults to true.',
    parameters: {
      type: 'object',
      properties: { rss_feed_url: { type: 'string' }, follow: { type: 'boolean' } },
      required: ['rss_feed_url'],
    },
  },
  meta: rssFeedMeta([SUBMIT_ROUTE], routeResponseSchema(SUBMIT_ROUTE)),
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    getDelegatedToolAuthority(user, invocationContext)
    const body = parseCreateSourceBody(args)
    return submitRssFeedSource(user, getRequestContentProvenance(), body.rss_feed_url, body.follow)
  },
}

type ImportArgs = { rss_feed_urls: string[]; follow?: boolean }
const importSource: MergedToolSource<
  ImportArgs,
  Awaited<ReturnType<typeof submitAndDispatchRssFeedImport>>
> = {
  schema: {
    description:
      'Import a JSON list of up to 500 feed URLs. Poll import_status with import.id. Follow defaults to false for administrators.',
    parameters: {
      type: 'object',
      properties: {
        rss_feed_urls: {
          type: 'array',
          items: { type: 'string', maxLength: 2083 },
          minItems: 1,
          maxItems: 500,
        },
        follow: { type: 'boolean' },
      },
      required: ['rss_feed_urls'],
    },
  },
  meta: rssFeedMeta([IMPORT_ROUTE], routeResponseSchema(IMPORT_ROUTE)),
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    getDelegatedToolAuthority(user, invocationContext)
    return submitAndDispatchRssFeedImport(user, getRequestContentProvenance(), args.rss_feed_urls, {
      should_follow_imported_feeds: args.follow,
    })
  },
}

type StatusArgs = { import_id: string; after?: string; limit?: number }
const statusSource: MergedToolSource<
  StatusArgs,
  NonNullable<Awaited<ReturnType<typeof getRssFeedImport>>>
> = {
  schema: {
    description:
      'Read one page of an RSS feed import. import_id is the import id. after is page_info.end_cursor. limit is 1 to 1000.',
    parameters: {
      type: 'object',
      properties: {
        import_id: { type: 'string' },
        after: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
      },
      required: ['import_id'],
    },
  },
  meta: rssFeedMeta([STATUS_ROUTE], routeResponseSchema(STATUS_ROUTE)),
  function: currentUser => async (args, invocationContext) => {
    const user = await requirePrivateToolUser(currentUser)
    getDelegatedToolAuthority(user, invocationContext)
    if (!isUUID(args.import_id)) throw createHttpError(400, 'Invalid import ID')
    const query: Record<string, unknown> = {}
    if (args.after !== undefined) query.after = args.after
    if (args.limit !== undefined) query.limit = String(args.limit)
    const page = parseRuntimePagination(rssFeedImportStatusPagination, query)
    const result = await getRssFeedImport(user.id, args.import_id, {
      limit: args.limit === undefined ? undefined : page.limit,
      after: page.after,
    })
    if (!result) throw createHttpError(404, 'RSS feed import not found')
    return result
  },
}

export const submitRssFeedGroup = {
  name: 'submit_rss_feed',
  options: [
    { option: 'submit', source: submitSource },
    { option: 'import', source: importSource },
    { option: 'import_status', source: statusSource },
  ],
} as const
export default createMergedTool(
  submitRssFeedGroup.name,
  'Submit RSS Feed',
  submitRssFeedGroup.options,
)
