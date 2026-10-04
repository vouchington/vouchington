import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { enqueueSubmitDsaStatementOfReasons } from '@queues/notifications/enqueues'
import { currentUserCanApproveCopyrightJurisdictionPolicy } from '@services/copyright-notices/jurisdiction-policy'
import { replayDsaStatementSubmission } from '@services/copyright-notices/dsa-statement-submission-replay'
import {
  getCopyrightDsaSorDatabaseFrom,
  isCopyrightDsaSorDatabaseEnabled,
} from '@services/copyright-notices/config'
import { isDsaTransparencyDatabaseConfigured } from '@services/copyright-notices/dsa-statement-submission-config'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiNoRequestBody } from '../../response-contract.mts'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

app.route('/api/v1/copyright-dsa-statement-submissions/:id/replays').post(async (ctx: Context) => {
  apiNoRequestBody('POST:/api/v1/copyright-dsa-statement-submissions/:id/replays')
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightJurisdictionPolicy,
    'POST:/api/v1/copyright-dsa-statement-submissions/:id/replays',
  )
  assertNotSuspended(currentUser)
  const submissionId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-dsa-statement-submissions/:id/replays', {
    path: ctx.params,
  })
  const replayed = await replayDsaStatementSubmission(currentUser.id, submissionId)
  if (
    replayed &&
    (await isCopyrightDsaSorDatabaseEnabled()) &&
    (await getCopyrightDsaSorDatabaseFrom()) !== null &&
    isDsaTransparencyDatabaseConfigured({
      url: process.env.DSA_TRANSPARENCY_DATABASE_URL ?? '',
      token: process.env.DSA_TRANSPARENCY_DATABASE_TOKEN ?? '',
    })
  )
    await enqueueSubmitDsaStatementOfReasons(submissionId)
  ctx.json({ replayed })
})
