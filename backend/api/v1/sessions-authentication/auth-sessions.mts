import app from '../../app.mts'
import { requireAuth, validateUUIDParam } from '../../response-helpers.mts'
import {
  listActiveUserSessions,
  registerAuthenticatedSession,
  revokeAllAuthenticatedSessions,
  revokeAuthenticatedSession,
} from '@services/jwt-session'
import { isUUIDv7 } from '@ts-shared/session-jwt'
import { assertNotSuspended } from '@services/users/suspension'
import { getDeviceContext } from './device-context.mts'
import type { Context } from '@jongleberry/api-server'
import { apiQuery } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'

const sessionsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/auth/sessions').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/auth/sessions', sessionsParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/auth/sessions')
  const sessionData = await ctx.getSessionTokenData()
  ctx.assert(sessionData, 401, 'Session data not found')
  const deviceClass = 'dc' in sessionData ? sessionData.dc : undefined
  const expiresAt =
    'exp' in sessionData && sessionData.exp ? new Date(sessionData.exp * 1000) : undefined

  if (isUUIDv7(sessionData.did) && isUUIDv7(sessionData.sid)) {
    await registerAuthenticatedSession({
      did: sessionData.did,
      sid: sessionData.sid,
      uid: currentUser.id,
      deviceClass,
      deviceContext: getDeviceContext(ctx),
      expiresAt,
      refreshMetadata: false,
    })
  }

  const options = sessionsParser.parse(ctx.query)
  const scope = `auth-sessions:${currentUser.id}:last-seen-desc-id-desc`
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(options.after, scope, 'Invalid cursor format')
    : undefined
  const { results, hasNextPage } = await listActiveUserSessions(currentUser.id, sessionData.sid, {
    limit: options.limit,
    after,
  })
  const cursorFor = (session: (typeof results)[number]) =>
    encodeScopedPreciseTimestampCursor(session.cursor_timestamp, session.id, scope)
  ctx.json({
    results: results.map(({ cursor_timestamp: _cursorTimestamp, ...session }) => session),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? cursorFor(results[0]) : null,
      end_cursor: hasNextPage && results.at(-1) ? cursorFor(results.at(-1)!) : null,
    },
  })
})

app.route('/api/v1/auth/sessions/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/auth/sessions/:id')
  assertNotSuspended(currentUser)
  const sessionId = validateUUIDParam(ctx, 'id')

  const revoked = await revokeAuthenticatedSession(currentUser.id, sessionId)
  if (!revoked) ctx.throw(404, 'Session not found')
  ctx.setStatus(204)
})

app.route('/api/v1/auth/sessions/revocations').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/auth/sessions/revocations')
  assertNotSuspended(currentUser)

  await revokeAllAuthenticatedSessions(currentUser.id)
  ctx.setStatus(204)
})
