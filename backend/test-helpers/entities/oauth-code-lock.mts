import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from '../../services/oauth-authorization-server/constants.mts'
import { getTestPostgresBackendProcessId } from '../postgres-lock-wait.mts'

/** Holds one authorization-code row until the test releases its transaction. */
export async function startPausedTestOAuthCodeLock(
  rawCode: string,
): Promise<{ completed: Promise<void>; holderProcessId: number; release(): void }> {
  const release = Promise.withResolvers<void>()
  const locked = Promise.withResolvers<number>()
  const completed = (async () => {
    await using transaction = await beginTransaction()
    const result = await transaction<{ id: string }>(
      `/* startPausedTestOAuthCodeLock */ SELECT id FROM oauth_authorization_codes
       WHERE code_hash = $1 FOR UPDATE`,
      [hashToken(OAUTH_SECRET_PURPOSES.authorizationCode, rawCode)],
    )
    if (result.rows.length !== 1) throw new Error('Test authorization code does not exist')
    locked.resolve(await getTestPostgresBackendProcessId(transaction))
    await release.promise
    await transaction.commit()
  })()
  void completed.catch(locked.reject)
  return {
    completed,
    holderProcessId: await locked.promise,
    release: () => release.resolve(),
  }
}
