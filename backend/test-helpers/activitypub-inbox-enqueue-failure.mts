import { onTestFinished } from 'vitest'
import { activitypub } from '../queues/activitypub/queues.mts'
import { getActivityPubInboxTestRequestId } from './api/request-query-profile.mts'

const failuresBeforeNativeAdmission = new WeakSet<object>()

/** Fail exactly one owned public add before calling the actual native queue method. */
export function failNextOwnedActivityPubInboxEnqueue(requestId: string): Error {
  const failure = new Error('simulated initial ActivityPub inbox enqueue failure')
  failuresBeforeNativeAdmission.add(failure)
  const original = activitypub.add
  const descriptor = Object.getOwnPropertyDescriptor(activitypub, 'add')
  let restored = false
  function restore() {
    if (restored) return
    restored = true
    if (descriptor) Object.defineProperty(activitypub, 'add', descriptor)
    else Reflect.deleteProperty(activitypub, 'add')
  }
  onTestFinished(restore)
  activitypub.add = ((...args: Parameters<typeof original>) => {
    if (
      args[0] === 'activitypub.processDelivery' &&
      getActivityPubInboxTestRequestId() === requestId
    ) {
      restore()
      return Promise.reject(failure)
    }
    return Reflect.apply(original, activitypub, args)
  }) as typeof original
  return failure
}

export function isActivityPubInboxPreAdmissionFailure(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && failuresBeforeNativeAdmission.has(reason)
}
