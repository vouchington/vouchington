import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuth } from '../../response-helpers.mts'
import { apiHeaders, apiResponse } from '../../response-contract.mts'
import { CONTRIBUTION_ADMISSION_IN_PROGRESS } from '@modules/on-error/error-codes'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { resolveAdmissionIdentity } from '@services/contribution-gating/admission'
import { getUserActivePlan } from '@services/memberships'
import {
  importTopics,
  TopicImportInProgressError,
  type ImportTopicResult,
} from '@services/user-import-export/import-topics'
import { assertNotSuspended } from '@services/users/suspension'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

const MAX_TOPICS_PER_IMPORT = 500
const MAX_TOPIC_IMPORT_BYTES = '2mb'

app.route('/api/v1/my/import/topics').post(async (ctx: Context) => {
  apiHeaders('POST:/api/v1/my/import/topics', {
    request: { 'Idempotency-Key': { type: 'string', format: 'uuid' } },
    responses: {
      409: {
        headers: { 'Retry-After': { type: 'integer' } },
        errors: [
          {
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This Idempotency-Key was already used for a different request.',
          },
          {
            code: 'CONTRIBUTION_ADMISSION_IN_PROGRESS',
            message: 'This topic import is still being processed. Please retry.',
          },
        ],
      },
    },
  })
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/import/topics')
  const provenance = getRequestContentProvenance()
  assertNotSuspended(currentUser)

  const body = await parseJsonBody<Record<string, unknown>>(ctx, MAX_TOPIC_IMPORT_BYTES)
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid JSON body',
  )
  ctx.assert(Array.isArray(body.names), 400, 'names (array) is required')

  const names = (body.names as unknown[]).filter(
    (n): n is string => typeof n === 'string' && n.trim().length > 0,
  )
  ctx.assert(names.length > 0, 400, 'At least one topic name is required')
  ctx.assert(
    names.length <= MAX_TOPICS_PER_IMPORT,
    400,
    `Maximum ${MAX_TOPICS_PER_IMPORT} names per import`,
  )

  const membershipPlan = await getUserActivePlan(currentUser.id)
  const idempotencyKeyHeader = ctx.req.headers['idempotency-key']
  ctx.assert(!Array.isArray(idempotencyKeyHeader), 400, 'Idempotency-Key must be a single UUID')
  const importIdentity = resolveAdmissionIdentity(idempotencyKeyHeader ?? null)
  let results: ImportTopicResult[]
  try {
    results = await importTopics(provenance, currentUser, names, {
      assertCanCreateTopicRecommendations: () =>
        assertCanContribute(currentUser, { membershipPlan }),
      importAttemptId: importIdentity.idempotencyKey,
      callerCanReplayIdempotencyIdentity: importIdentity.callerCanReplay,
      membershipPlan,
    })
  } catch (error) {
    if (error instanceof TopicImportInProgressError) {
      ctx.set('Retry-After', String(error.retryAfterSeconds))
      ctx.throw(
        409,
        'This topic import is still being processed. Please retry.',
        CONTRIBUTION_ADMISSION_IN_PROGRESS,
      )
    }
    throw error
  }
  ctx.json(apiResponse('POST:/api/v1/my/import/topics', { results }))
})
