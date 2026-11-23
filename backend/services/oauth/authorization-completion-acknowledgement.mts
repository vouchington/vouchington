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
       WHERE id = $1 AND status = 'completed' AND expires_at > $2
         AND completion_token_hash = $3 RETURNING expires_at`,
    [authorization.id, decisionAt, authorization.completion_token_hash],
  )
  const written = rows[0]
  if (!written) {
    const current = await classifyAcknowledgementLoss()
    assertCompletionCaller(current, options)
    if (current.expires_at <= new Date()) throw createHttpError(410, 'OAuth authorization expired')
    throw createHttpError(409, 'OAuth authorization completion was already acknowledged')
  }
  if (written.expires_at <= new Date()) throw createHttpError(410, 'OAuth authorization expired')
  await query.commit()

  async function readAcknowledgement(): Promise<CompletionRow> {
    const { rows: current } = await query(
      `/* readOAuthAuthorizationCompletionAcknowledgement */ SELECT *
       FROM view_oauth_authorization_current_records WHERE id = $1`,
      [options.flowId],
    )
    return requireRow(current[0])
  }

  // Own query name: the lost-race re-read happens only when a concurrent acknowledgement or
  // expiry wins, so it must not count as a repeat of the first read.
  async function classifyAcknowledgementLoss(): Promise<CompletionRow> {
    const { rows: current } = await query(
      `/* classifyOAuthAuthorizationAcknowledgementLoss */ SELECT *
       FROM view_oauth_authorization_current_records WHERE id = $1`,
      [options.flowId],
    )
    return requireRow(current[0])
  }
}

function requireRow(row: unknown): CompletionRow {
  if (!row) throw createHttpError(404, 'OAuth authorization not found')
  return row as CompletionRow
}
