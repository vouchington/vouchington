import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
  parseJsonBody,
} from '../../response-helpers.mts'
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
import { defineQueryContract, queryInteger, queryUuid } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'

const MOD_NOTES_LIMIT = { minimum: 1, maximum: 100, default: 20 } as const
const modNotesQuery = defineQueryContract({
  after: queryUuid(),
  limit: queryInteger(MOD_NOTES_LIMIT),
})

// Typed as strings: the generated contract checks the carrier shape and unknown keys, while UUID,
// blank, and length checks in parseCreateUserModNoteInput keep their existing 422 responses.
type CreateUserModNoteRequest = { body: string; community_id?: string | null }

app.route('/api/v1/users/:userId/moderation-context').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/users/:userId/moderation-context')
  ctx.assert(await currentUserCanAccessUserModNotes(currentUser), 403, 'Forbidden')
  const userId = validateUUIDParam(ctx, 'userId')
  validateRequestContract(ctx, 'GET:/api/v1/users/:userId/moderation-context', {
    path: ctx.params,
  })
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
  ctx.assert(!Object.hasOwn(ctx.query, 'cursor'), 400, 'Use after instead of cursor')
  // A malformed or out-of-range `limit` is clamped and a blank `after` is ignored, as documented;
  // the contract sees those settled values, so it rejects only a non-UUID or repeated `after`.
  const limitRaw = ctx.query.limit ? parseInt(ctx.query.limit as string, 10) : undefined
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw!, MOD_NOTES_LIMIT.minimum), MOD_NOTES_LIMIT.maximum)
    : undefined
  const after = ctx.query.after || undefined
  validateRequestContract(ctx, 'GET:/api/v1/users/:userId/mod-notes', {
    path: ctx.params,
    query: {
      ...(limit === undefined ? {} : { limit }),
      ...(after === undefined ? {} : { after }),
    },
  })
  const beforeId = (after as string | undefined) ?? null
  const { notes, hasNextPage } = await listUserModNotes(currentUser, userId, { limit, beforeId })
  ctx.json({ notes, page_info: { has_next_page: hasNextPage } })
})

app.route('/api/v1/users/:userId/mod-notes').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/users/:userId/mod-notes')
  assertNotSuspended(currentUser)
  ctx.assert(await currentUserCanAccessUserModNotes(currentUser), 403, 'Forbidden')
  const userId = validateUUIDParam(ctx, 'userId')
  const body = await parseJsonBody<CreateUserModNoteRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/users/:userId/mod-notes', {
    body,
    path: ctx.params,
  })
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
  validateRequestContract(ctx, 'DELETE:/api/v1/users/:userId/mod-notes/:noteId', {
    path: ctx.params,
  })
  await deleteUserModNote(currentUser, noteId, userId)
  ctx.json({ ok: true })
})
