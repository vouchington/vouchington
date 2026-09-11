import type { EnqueueReturnType } from '@voucha/types'
import type { UserLoginContext } from '../types.mts'
import {
  enqueueProcessUserCreated,
  enqueueProcessAutoFollowReferrer,
  enqueueProcessUserLoggedIn,
  enqueueProcessUserUpdated,
} from './enqueue-jobs.mts'

export const enqueueOnUserCreated = (id: string, context: UserLoginContext, priority?: number) => {
  return enqueueProcessUserCreated({ id, context }, priority)
}
export const enqueueAutoFollowReferrer = (
  newUserId: string,
  referrerId: string,
): EnqueueReturnType => {
  return enqueueProcessAutoFollowReferrer({ newUserId, referrerId })
}
export const enqueueOnUserLoggedIn = (id: string, context: UserLoginContext, priority?: number) => {
  return enqueueProcessUserLoggedIn({ id, context }, priority)
}
export const enqueueOnUserUpdated = (id: string, priority?: number) => {
  return enqueueProcessUserUpdated({ id }, priority)
}
