import { normalizeHostname } from '@ts-shared/utils/urls'
import createHttpError from 'http-errors'

/** An Undo may reserve an unseen id only in the verified sending actor's host namespace. */
export function assertRemoteActivityHost(activityId: string, actorUri: string): void {
  let activity: URL
  let actor: URL
  try {
    activity = new URL(activityId)
    actor = new URL(actorUri)
  } catch {
    throw createHttpError(400, 'Activity and actor ids must be valid HTTP URLs')
  }
  if (
    !['http:', 'https:'].includes(activity.protocol) ||
    !['http:', 'https:'].includes(actor.protocol) ||
    normalizeHostname(activity.hostname) !== normalizeHostname(actor.hostname)
  ) {
    throw createHttpError(400, 'Activity id host must match its signing actor host')
  }
}
