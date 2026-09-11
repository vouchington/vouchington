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
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { buildPageInfo, createPaginationParser, decodeScopedAliasCursor } from '@modules/pagination'

const usersSearchParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 25, default: 10 },
})

app.route('/api/v1/users').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/users')
  const { username, q } = ctx.query

  if (q !== undefined && !username) {
    apiQuery('GET:/api/v1/users', usersSearchParser)
    ctx.assert(currentUser, 401, 'Unauthorized')
    const qValue = Array.isArray(q) ? (q[0] ?? '') : q
    const options = usersSearchParser.parse(ctx.query)
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
      ? Object.fromEntries(users.map(u => [u.id, muteBookmarks[u.id]?.mute === true]))
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
