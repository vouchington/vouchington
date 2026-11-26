import { beginTransaction } from '@data-stores/psql'

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
