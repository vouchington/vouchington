import { beginTransaction } from '@data-stores/psql'
import createHttpError from 'http-errors'
import {
  assertCompletionCaller,
  getAuthorizationForCompletion,
} from './authorization-completion-persistence.mts'
import type { OAuthAuthorizationCompletionOptions } from './authorization-completion-types.mts'

export async function acknowledgeOAuthAuthorizationCompletion(
  options: OAuthAuthorizationCompletionOptions,
): Promise<void> {
  await using query = await beginTransaction()
  const authorization = await getAuthorizationForCompletion(options.flowId, query)
  assertCompletionCaller(authorization, options)
  if (authorization.expires_at.getTime() <= Date.now()) {
    throw createHttpError(410, 'OAuth authorization expired')
  }
  if (authorization.status !== 'completed') {
    throw createHttpError(409, 'OAuth authorization completion is not ready to acknowledge')
  }

  const { rowCount } = await query(
    `/* acknowledgeOAuthAuthorizationCompletion */ UPDATE oauth_authorizations
       SET completion_token_hash = NULL
       WHERE id = $1 AND completion_token_hash IS NOT NULL`,
    [authorization.id],
  )
  if (rowCount !== 1) {
    throw createHttpError(409, 'OAuth authorization completion was already acknowledged')
  }
  await query.commit()
}
