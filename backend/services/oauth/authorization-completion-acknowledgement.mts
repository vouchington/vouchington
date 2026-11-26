import { beginTransaction } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { assertCompletionCaller } from './authorization-completion-persistence.mts'
import type {
  CompletionRow,
  OAuthAuthorizationCompletionOptions,
} from './authorization-completion-types.mts'

export async function acknowledgeOAuthAuthorizationCompletion(
  options: OAuthAuthorizationCompletionOptions,
): Promise<void> {
  await using query = await beginTransaction()
  const authorization = await readAcknowledgement()
  assertCompletionCaller(authorization, options)
  const decisionAt = new Date()
  if (authorization.expires_at <= decisionAt) {
    throw createHttpError(410, 'OAuth authorization expired')
  }
  if (authorization.status !== 'completed') {
    throw createHttpError(409, 'OAuth authorization completion is not ready to acknowledge')
  }

  const { rows } = await query<{ expires_at: Date }>(
    `/* acknowledgeOAuthAuthorizationCompletion */ UPDATE oauth_authorizations
       SET completion_token_hash = NULL
       WHERE id = $1 AND status = 'completed' AND completion_token_hash = $2
       RETURNING expires_at`,
    [authorization.id, authorization.completion_token_hash],
  )
  const written = rows[0]
  // The read above passed the caller, status and expiry checks. Only an acknowledgement clears the
  // token hash of a completed row, so a missed UPDATE means a concurrent acknowledgement consumed
  // the credential (or retention deleted the row), which is the 401 a request arriving afterwards
  // gets from the read.
  if (!written) throw createHttpError(401, 'OAuth completion token is invalid')
  if (written.expires_at <= new Date()) throw createHttpError(410, 'OAuth authorization expired')
  await query.commit()

  async function readAcknowledgement(): Promise<CompletionRow> {
    const { rows: current } = await query(
      `/* readOAuthAuthorizationCompletionAcknowledgement */ SELECT *
       FROM view_oauth_authorization_current_records WHERE id = $1`,
      [options.flowId],
    )
    const row = current[0] as CompletionRow | undefined
    if (!row) throw createHttpError(404, 'OAuth authorization not found')
    return row
  }
}
