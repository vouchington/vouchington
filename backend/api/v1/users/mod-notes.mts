import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam, parseJsonBody } from '../../response-helpers.mts'
import {
  createUserModNote,
  listUserModNotes,
  deleteUserModNote,
  getUserModerationContext,
  parseCreateUserModNoteInput,
  isModerationStaff,
  currentUserCanAccessUserModNotes,
} from '@services/user-mod-notes'
import { getPrivateUserByAny } from '@services/users/get'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { defineQueryContract, queryInteger, queryUuid } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'

const modNotesQuery = defineQueryContract({
  after: queryUuid(),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 20 }),
})

app.route('/api/v1/users/:userId/moderation-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/users/:userId/moderation-context')
  ctx.assert(await currentUserCanAccessUserModNotes(currentUser), 403, 'Forbidden')
  const userId = validateUUIDParam(ctx, 'userId')
  const targetUser = await getPrivateUserByAny(userId)
  ctx.assert(targetUser, 404, 'User not found')
  const isStaff = isModerationStaff(currentUser)
  const [context, { notes, hasNextPage }] = await Promise.all([
    getUserModerationContext(currentUser, targetUser, isStaff),
    listUserModNotes(currentUser, userId),
  ])
  ctx.json({
    context: isStaff
      ? context
      : {
          account_age_ms: context.account_age_ms,
          trust_tier: null,
          active_suspension: null,
          content_removal_count: null,
          community_removal_count: null,
        },
    notes,
    page_info: { has_next_page: hasNextPage },
  })
})

app.route('/api/v1/users/:userId/mod-notes').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/users/:userId/mod-notes', modNotesQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/users/:userId/mod-notes')
  ctx.assert(await currentUserCanAccessUserModNotes(currentUser), 403, 'Forbidden')
  const userId = validateUUIDParam(ctx, 'userId')
  const limitRaw = ctx.query.limit ? parseInt(ctx.query.limit as string, 10) : undefined
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined
  ctx.assert(!Object.hasOwn(ctx.query, 'cursor'), 400, 'Use after instead of cursor')
  const afterRaw = ctx.query.after
  ctx.assert(afterRaw === undefined || typeof afterRaw === 'string', 422, 'Invalid after')
  ctx.assert(!afterRaw || isUUID(afterRaw), 422, 'Invalid after')
  const beforeId = afterRaw ?? null
  const { notes, hasNextPage } = await listUserModNotes(currentUser, userId, { limit, beforeId })
  ctx.json({ notes, page_info: { has_next_page: hasNextPage } })
})

app.route('/api/v1/users/:userId/mod-notes').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/users/:userId/mod-notes')
  assertNotSuspended(currentUser)
  ctx.assert(await currentUserCanAccessUserModNotes(currentUser), 403, 'Forbidden')
  const userId = validateUUIDParam(ctx, 'userId')
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const input = parseCreateUserModNoteInput({
    targetUserId: userId,
    communityId: body.community_id,
    body: body.body,
  })
  const note = await createUserModNote(currentUser, input)
  ctx.setStatus(201)
  ctx.json({ note })
})

app.route('/api/v1/users/:userId/mod-notes/:noteId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/users/:userId/mod-notes/:noteId')
  assertNotSuspended(currentUser)
  ctx.assert(await currentUserCanAccessUserModNotes(currentUser), 403, 'Forbidden')
  const userId = validateUUIDParam(ctx, 'userId')
  const noteId = validateUUIDParam(ctx, 'noteId')
  await deleteUserModNote(currentUser, noteId, userId)
  ctx.json({ ok: true })
})
