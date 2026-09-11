import { setTimeout as delay } from 'node:timers/promises'
import { beginTransaction, write } from '@data-stores/psql'

export async function completeTestOAuthAuthorizationWhileRecoveryWaits<T>(
  authorizationId: string,
  githubUserId: string,
  startRecovery: () => Promise<T>,
): Promise<T> {
  let recovery: Promise<T> | undefined
  {
    await using transaction = await beginTransaction()
    await transaction(
      `/* completeTestOAuthAuthorizationWhileRecoveryWaits:lock */
         SELECT id
         FROM oauth_authorizations
         WHERE id = $1
         FOR UPDATE`,
      [authorizationId],
    )
    recovery = startRecovery()
    await waitForBlockedOAuthAuthorizationRecovery()
    await transaction(
      `/* completeTestOAuthAuthorizationWhileRecoveryWaits:complete */
         UPDATE oauth_authorizations
         SET status = 'completion_ready',
             github_user_id = $2,
             callback_code_ciphertext = NULL,
             exchange_claim_id = NULL,
             completion_ready_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
      [authorizationId, githubUserId],
    )
    await transaction.commit()
  }
  if (!recovery) throw new Error('OAuth authorization recovery did not start')
  return recovery
}

async function waitForBlockedOAuthAuthorizationRecovery(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await write<{ blocked: boolean }>(
      `/* waitForBlockedOAuthAuthorizationRecovery */ SELECT EXISTS (
         SELECT 1
         FROM pg_stat_activity
         WHERE pid <> pg_backend_pid()
           AND state = 'active'
           AND wait_event_type = 'Lock'
           AND query LIKE $1
       ) AS blocked`,
      ['%/* getRecoverableOAuthAuthorizationIds */%'],
    )
    if (rows[0]?.blocked) return
    await delay(10)
  }
  throw new Error('OAuth authorization recovery did not wait for the fixture row lock')
}
