import type { EnqueueReturnType } from '@voucha/types'
import {
  enqueueProcessUserCreated,
  enqueueProcessAutoFollowReferrer,
  enqueueProcessUserLoggedIn,
  enqueueProcessUserUpdated,
} from './enqueue-jobs.mts'

export const enqueueOnUserCreated = (id: string, priority?: number) => {
  return enqueueProcessUserCreated({ id }, priority)
}
export const enqueueAutoFollowReferrer = (
  newUserId: string,
  referrerId: string,
): EnqueueReturnType => {
  return enqueueProcessAutoFollowReferrer({ newUserId, referrerId })
}
export const enqueueOnUserLoggedIn = (id: string, priority?: number) => {
  return enqueueProcessUserLoggedIn({ id }, priority)
}
export const enqueueOnUserUpdated = (id: string, priority?: number) => {
  return enqueueProcessUserUpdated({ id }, priority)
}
