import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getPublicUserByAny,
  getPrivateUserByAny,
  isAdminUser,
  searchAdminUsers,
  searchUsers,
  usersSearchCursorScope,
} from '@services/users'
import { getBookmarksForEntities } from '@services/bookmarks'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { validateUsername } from '@modules/utils'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import {
  buildPageInfo,
  createPaginationParser,
  decodeScopedAliasCursor,
  defineQueryContract,
  queryString,
} from '@modules/pagination'

const usersSearchParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 25, default: 10 },
})
const usersQuery = defineQueryContract({ username: queryString(), q: queryString() })

app.route('/api/v1/users').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users', usersSearchParser, usersQuery)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users')
  const { username, q } = ctx.query

  if (q !== undefined && !username) {
    ctx.assert(currentUser, 401, 'Unauthorized')
    const normalizedSearchQuery = {
      q: Array.isArray(ctx.query.q) ? (ctx.query.q[0] ?? '') : ctx.query.q,
    }
    const qValue = normalizedSearchQuery.q
    const options = parseAndValidatePaginatedRequest(ctx, 'GET:/api/v1/users', usersSearchParser, {
      extraQueryContracts: [usersQuery.queryContract],
      ignoredKeys: ['q'],
    })
    validateRequestContract(ctx, 'GET:/api/v1/users', { query: normalizedSearchQuery })
    const admin = isAdminUser(currentUser)
    const scope = usersSearchCursorScope({ query: qValue, admin })
    const after = options.after
      ? decodeScopedAliasCursor(options.after, scope, 'Invalid cursor format').alias
      : undefined

    const { results: users, hasNextPage } = admin
      ? await searchAdminUsers(qValue, { limit: options.limit, after })
      : await searchUsers(qValue, { limit: options.limit, after })

    const muteBookmarks =
      users.length > 0 ? await getBookmarksForEntities(currentUser, 'user', users) : null
    const muted: Record<string, boolean> | undefined = muteBookmarks
      ? Object.fromEntries(users.map(u => [u.id, muteBookmarks[u.id]?.mute ?? false]))
      : undefined

    const getCursor = (user: (typeof users)[number]) => ({
      alias: user.username ? user.username.toLowerCase() : '',
      scope,
    })

    ctx.json(
      apiResponse('GET:/api/v1/users#search', {
        results: users,
        page_info: buildPageInfo(users, { hasNextPage, getCursor }),
        ...(muted ? { muted } : {}),
      }),
    )
    return
  }

  if (!username || typeof username !== 'string') {
    ctx.throw(422, 'Username or search query is required')
  }
  validateRequestContract(ctx, 'GET:/api/v1/users', { query: { username: ctx.query.username } })

  // Validate and normalize username to prevent enumeration by email/phone
  const validatedUsername = validateUsername(username)

  // Check if searching for self to return private view
  const isSelf = currentUser?.username?.toLowerCase() === validatedUsername.toLowerCase()
  const user = isSelf
    ? await getPrivateUserByAny(validatedUsername)
    : await getPublicUserByAny(validatedUsername)

  ctx.assert(user, 404, 'User not found')

  // Only cache for logged-out users
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`)
  }

  ctx.json({ user })
})
