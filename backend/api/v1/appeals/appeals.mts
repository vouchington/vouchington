import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  parseCreateModerationAppealInput,
  createModerationAppeal,
  getModerationAppealById,
  getModerationAppealByIdFromPrimary,
  listModerationAppeals,
  redactModerationAppeal,
  listRedactedModerationAppeals,
  MODERATION_APPEAL_STATUSES,
  type ModerationAppealStatus,
} from '@services/moderation-appeals'
import { isModerationStaff } from '@services/users'
import { apiResponse } from '../../response-contract.mts'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'

type CreateModerationAppealRequest = {
  target_type: 'warning' | 'ban' | 'removal' | 'suspension'
  target_id?: ApiUuidContract
  post_removal_kind?: 'platform' | 'community'
  appeal_reason: string
  cf_turnstile_response?: string
}

app.route('/api/v1/appeals').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/appeals')
  const body = (await ctx.request.json('1mb')) as CreateModerationAppealRequest
  validateRequestContract(ctx, 'POST:/api/v1/appeals', { body })
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'appeals.create' })
  const input = parseCreateModerationAppealInput(body)
  const { appeal, isDuplicate } = await createModerationAppeal(currentUser, input)
  const isStaff = isModerationStaff(currentUser)
  ctx.setStatus(isDuplicate ? 200 : 201)
  ctx.json({ appeal: isStaff ? appeal : redactModerationAppeal(appeal), isDuplicate })
})

app.route('/api/v1/appeals').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/appeals')

  // Intentional carrier skip: `limit` is an integer on the wire and ctx.query holds raw strings,
  // so the shared adapter would reject valid requests. Unknown values fall back to defaults here.
  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25

  const statusParam = ctx.query.status
  const status: ModerationAppealStatus =
    typeof statusParam === 'string' &&
    MODERATION_APPEAL_STATUSES.includes(statusParam as ModerationAppealStatus)
      ? (statusParam as ModerationAppealStatus)
      : 'pending'
  const isStaff = isModerationStaff(currentUser)

  // Non-staff see only their own appeals; `mine=true` also scopes staff callers.
  const appellantUserId = !isStaff || ctx.query.mine === 'true' ? currentUser.id : undefined
  const cursorScope = `appeals:${status}:${appellantUserId ?? 'staff-all'}:id-desc`
  const beforeId =
    typeof ctx.query.after === 'string'
      ? decodeScopedUuidCursor(ctx.query.after, cursorScope, 'Invalid cursor format').id
      : undefined

  const { appeals, hasNextPage } = await listModerationAppeals({
    status,
    limit,
    beforeId,
    appellantUserId,
  })

  const page_info = {
    has_next_page: hasNextPage,
    start_cursor: appeals[0] ? encodeScopedUuidCursor(appeals[0].id, cursorScope) : null,
    end_cursor:
      hasNextPage && appeals.at(-1)
        ? encodeScopedUuidCursor(appeals.at(-1)!.id, cursorScope)
        : null,
  }
  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/appeals#staff', { appeals, page_info }))
    return
  }

  ctx.json({ appeals: listRedactedModerationAppeals(appeals), page_info })
})

app.route('/api/v1/appeals/:id').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/appeals/:id')
  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/appeals/:id', { path: ctx.params })

  const isStaff = isModerationStaff(currentUser)
  const appeal = await (isStaff && ctx.query.consistency === 'primary'
    ? getModerationAppealByIdFromPrimary(id)
    : getModerationAppealById(id))
  ctx.assert(appeal, 404, 'Appeal not found')
  const isOwner = appeal.appellant_id === currentUser.id

  ctx.assert(isStaff || isOwner, 403, 'Forbidden')

  ctx.json({ appeal: isStaff ? appeal : redactModerationAppeal(appeal) })
})
