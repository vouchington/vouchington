import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import {
  createApiKey,
  searchApiKeys,
  revokeApiKey,
  API_KEY_TYPES,
  validateApiKeyCreationPermissions,
} from '@services/api-keys'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'

const apiKeysParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

// GET /api/v1/my/api-keys — list current user's API keys
app.route('/api/v1/my/api-keys').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/api-keys', apiKeysParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/api-keys')

  const options = apiKeysParser.parse(ctx.query)
  const scope = `my-api-keys:${currentUser.id}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await searchApiKeys(currentUser.id, {
    limit: options.limit,
    afterId,
  })
  ctx.json({
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, scope) : null,
      end_cursor:
        hasNextPage && results.at(-1) ? encodeScopedUuidCursor(results.at(-1)!.id, scope) : null,
    },
  })
})

// POST /api/v1/my/api-keys — create new API key
app.route('/api/v1/my/api-keys').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/api-keys')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>

  ctx.assert(
    typeof body.label === 'string' && body.label.trim().length > 0,
    400,
    'label is required',
  )
  ctx.assert(
    typeof body.label === 'string' && body.label.trim().length <= 100,
    400,
    'label must be 100 characters or fewer',
  )
  ctx.assert(Array.isArray(body.permissions), 400, 'permissions must be an array')
  ctx.assert((body.permissions as unknown[]).length > 0, 400, 'permissions must not be empty')
  ctx.assert(
    (body.permissions as unknown[]).every(p => typeof p === 'string'),
    400,
    'permissions must be an array of strings',
  )
  const rawType = body.type ?? 'rss'
  ctx.assert(
    typeof rawType === 'string' && (API_KEY_TYPES as readonly string[]).includes(rawType),
    400,
    `invalid type — valid values: ${API_KEY_TYPES.join(', ')}`,
  )

  const type = rawType as (typeof API_KEY_TYPES)[number]

  const label = (body.label as string).trim()
  const permissions = body.permissions as string[]
  const permissionError = validateApiKeyCreationPermissions(currentUser, type, permissions)
  ctx.assert(permissionError == null, 400, permissionError ?? 'invalid permissions')

  const { apiKey, rawKey } = await createApiKey(currentUser.id, type, label, permissions)

  ctx.setStatus(201)
  ctx.json({ api_key: apiKey, raw_key: rawKey })
})

// DELETE /api/v1/my/api-keys/:id — revoke an API key
app.route('/api/v1/my/api-keys/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/api-keys/:id')

  const id = ctx.params.id!
  ctx.assert(id && isUUID(id), 400, 'id must be a valid UUID')

  const revoked = await revokeApiKey(currentUser.id, id)
  ctx.assert(revoked, 404, 'API key not found')

  ctx.setStatus(204)
})
