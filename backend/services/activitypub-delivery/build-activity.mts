import { AP_CONTEXT, getActivityUri, getActorUri, getPostUri } from '@modules/activitypub-uris'
import type { BuildActivityInput, OutboundActivityJson } from './types.mts'

// Builds the AS2 JSON body for an outbound Follow/Like/Undo(Follow)/Undo(Like)/Accept activity
// (Phase C4, Accept added as a C-followup). Wire shapes mirror
// @services/ap-inbox-activities/dispatch-activity.mts's inbound parsing: Follow/Like's `object` is
// a bare target URI string; Undo's `object` is a minimal embedded `{ type, object }` activity
// (dispatch-activity.mts's getEmbeddedActivity only reads those two fields), not a copy of the
// full original activity.
export function buildActivityJson(input: BuildActivityInput): OutboundActivityJson {
  const actor = getActorUri(input.sourceUserId)
  const id = getActivityUri(input.activityId)

  switch (input.activityType) {
    case 'Follow':
      return {
        '@context': AP_CONTEXT,
        id,
        type: 'Follow',
        actor,
        object: getActorUri(input.targetUserId),
      }
    case 'Like':
      return {
        '@context': AP_CONTEXT,
        id,
        type: 'Like',
        actor,
        object: getPostUri(input.targetPostId),
      }
    case 'UndoLike':
      return {
        '@context': AP_CONTEXT,
        id,
        type: 'Undo',
        actor,
        object: {
          id: getActivityUri(input.originalActivityId),
          type: 'Like',
          object: getPostUri(input.targetPostId),
        },
      }
    case 'UndoFollow':
      return {
        '@context': AP_CONTEXT,
        id,
        type: 'Undo',
        actor,
        object: {
          id: getActivityUri(input.originalActivityId),
          type: 'Follow',
          object: getActorUri(input.targetUserId),
        },
      }
    case 'Accept':
      // Embeds the original Follow (id/actor/object) rather than a bare id reference: our own
      // activity ids are not dereferenceable (see getActivityUri's doc comment), and the inbound
      // Follow's id belongs to the sender, not us, so embedding is the only shape guaranteed to
      // round-trip through every real-world implementation's Follow/Accept matching.
      return {
        '@context': AP_CONTEXT,
        id,
        type: 'Accept',
        actor,
        object: {
          id: input.followActivityId,
          type: 'Follow',
          actor: input.followActorUri,
          object: actor,
        },
      }
    default: {
      const exhaustiveCheck: never = input
      throw new Error(`Unknown outbound activity type: ${JSON.stringify(exhaustiveCheck)}`)
    }
  }
}
