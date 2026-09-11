import { AsyncLocalStorage } from 'node:async_hooks'

export type BlueskySessionAuthorizationContext = {
  authorizationId: string
  owner: {
    kind: 'linking' | 'attached'
    userId: string
  }
  callbackMode?: 'web' | 'native'
}

const authorizationContext = new AsyncLocalStorage<BlueskySessionAuthorizationContext>()
const persistenceBlockedContext = new AsyncLocalStorage<boolean>()

export function getBlueskySessionAuthorizationContext():
  | BlueskySessionAuthorizationContext
  | undefined {
  return authorizationContext.getStore()
}

export async function runWithBlueskySessionAuthorization<T>(
  context: BlueskySessionAuthorizationContext,
  callback: () => Promise<T>,
): Promise<T> {
  return await authorizationContext.run(context, callback)
}

export async function runWithAttachedBlueskySession<T>(
  userId: string,
  authorizationId: string,
  callback: () => Promise<T>,
): Promise<T> {
  return await runWithBlueskySessionAuthorization(
    { authorizationId, owner: { kind: 'attached', userId } },
    callback,
  )
}

export function isBlueskySessionPersistenceBlocked(): boolean {
  return persistenceBlockedContext.getStore() ?? false
}

export async function runWithBlueskySessionPersistenceBlocked<T>(
  callback: () => Promise<T>,
): Promise<T> {
  return await persistenceBlockedContext.run(true, callback)
}
