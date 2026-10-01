import { listModerationAppealPage } from '@services/moderation-appeals/list-page'
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
  redactModerationAppeal,
  listRedactedModerationAppeals,
  MODERATION_APPEAL_STATUSES,
} from '@services/moderation-appeals'
import { isModerationStaff } from '@services/users'
<<<<<<< HEAD
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  defineQueryContract,
  queryBoolean,
  queryEnum,
  queryInteger,
  queryString,
} from '@modules/pagination'
import { parseAndValidateCaseListQuery } from '../../case-list-query-helpers.mts'

type CreateModerationAppealRequest = {
  target_type: 'warning' | 'ban' | 'removal' | 'suspension'
  target_id?: ApiUuidContract
  post_removal_kind?: 'platform' | 'community'
  appeal_reason: string
  cf_turnstile_response?: string
}

const appealsQuery = defineQueryContract({
  status: queryEnum(MODERATION_APPEAL_STATUSES, {
    default: 'pending',
    description: 'Appeal status; unknown values use pending.',
  }),
  mine: queryBoolean({ description: 'Only appeals the caller filed; staff otherwise see all.' }),
  limit: queryInteger({ minimum: 1, maximum: 100, default: 25 }),
  after: queryString(),
})

app.route('/api/v1/appeals').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/appeals')
  const body = (await ctx.request.json('1mb')) as CreateModerationAppealRequest
  validateRequestContract(ctx, 'POST:/api/v1/appeals', { body })
=======
import { apiResponse } from '../../response-contract.mts'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
app.route('/api/v1/appeals').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/appeals')
  const provenance = getRequestContentProvenance()
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
>>>>>>> e84d83fd2 (feat(content): require creation provenance for all content writers)
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'appeals.create' })
  const input = parseCreateModerationAppealInput(body)
  const { appeal, isDuplicate } = await createModerationAppeal(currentUser, provenance, input)
  const isStaff = isModerationStaff(currentUser)
  ctx.setStatus(isDuplicate ? 200 : 201)
  ctx.json({ appeal: isStaff ? appeal : redactModerationAppeal(appeal), isDuplicate })
})

app.route('/api/v1/appeals').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/appeals', appealsQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/appeals')

  const { status, limit, after, mine } = parseAndValidateCaseListQuery(
    ctx,
    'GET:/api/v1/appeals',
    MODERATION_APPEAL_STATUSES,
  )
  const isStaff = isModerationStaff(currentUser)

  // Non-staff see only their own appeals; `mine=true` also scopes staff callers.
  const appellantUserId = !isStaff || mine ? currentUser.id : undefined
  const { appeals, page_info } = await listModerationAppealPage({
    status,
    limit,
    appellantUserId,
    after,
  })
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

  if (isStaff) {
    ctx.json(apiResponse('GET:/api/v1/appeals/:id#staff', { appeal }))
    return
  }
  ctx.json({ appeal: redactModerationAppeal(appeal) })
})
