import type { TransactionQuery } from '@data-stores/psql'
import {
  getAuthorizationAccount,
  getStoredCompletionResult,
} from './authorization-completion-persistence.mts'
import type {
  CompletionRow,
  DurableOAuthAuthorizationCompletion,
} from './authorization-completion-types.mts'

export async function readStoredCompletionReplay(
  authorization: CompletionRow,
  query: TransactionQuery,
): Promise<DurableOAuthAuthorizationCompletion> {
  const stored = getStoredCompletionResult(authorization)
  if (stored.kind === 'mfa_required') return stored
  const account = await getAuthorizationAccount(authorization, query)
  if (stored.kind === 'authenticated') {
    return {
      ...stored,
      newlyCompleted: false,
      firstFactor: {
        type: 'provider',
        provider: authorization.provider,
        providerUserId: account.provider_user_id,
      },
    }
  }
  if (authorization.purpose === 're_auth') return { kind: 'reauthenticated', account }
  return { ...stored, account, provider: authorization.provider, newlyCompleted: false }
}
