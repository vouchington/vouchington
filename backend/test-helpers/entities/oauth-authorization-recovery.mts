import { beginTransaction } from '@data-stores/psql'

/** Actual held row is skipped; no lock-start event, timer, polling or borrowed recovery executor. */
export async function completeTestOAuthAuthorizationWhileRecoverySkipsLockedRow<T>(
  authorizationId: string,
  githubUserId: string,
  recover: () => Promise<T>,
): Promise<{ whileLocked: T; afterCompletion: T }> {
  let whileLocked: T
  {
    await using holder = await beginTransaction()
    await holder(
      '/* completeTestOAuthAuthorizationWhileRecoverySkipsLockedRow:lock */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE',
      [authorizationId],
    )
    // This must finish while the holder still owns the lock, not after rollback and retry.
    whileLocked = await recover()
    await holder(
      `/* completeTestOAuthAuthorizationWhileRecoverySkipsLockedRow:complete */
       UPDATE oauth_authorizations
       SET github_account_id = (SELECT id FROM github_accounts WHERE github_user_id = $2), callback_code_ciphertext = NULL,
           exchange_claim_id = NULL, completion_ready_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [authorizationId, githubUserId],
    )
    await holder.commit()
  }
  return { whileLocked, afterCompletion: await recover() }
}

/** Holder is registered before invoking the real service; disposal owns rollback on every exit. */
export async function withTestOAuthAuthorizationRowLocked<Result>(
  authorizationId: string,
  run: () => Promise<Result>,
): Promise<Result> {
  await using holder = await beginTransaction()
  await holder(
    '/* withTestOAuthAuthorizationRowLocked */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT',
    [authorizationId],
  )
  return await run()
}

/** A second actual native transaction must fail NOWAIT until the holder callback has settled. */
export async function acquireTestOAuthAuthorizationRowLock(
  authorizationId: string,
): Promise<string> {
  await using contender = await beginTransaction()
  const { rows } = await contender<{ id: string }>(
    '/* acquireTestOAuthAuthorizationRowLock */ SELECT id FROM oauth_authorizations WHERE id = $1 FOR UPDATE NOWAIT',
    [authorizationId],
  )
  const row = rows[0]
  if (!row) throw new Error('Owned OAuth authorization lock probe found no row')
  await contender.commit()
  return row.id
}
