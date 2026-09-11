import { getSiteUrl } from '@modules/utils'

// An outbound activity's ActivityPub identity. Pure URI shape only — there is no
// `GET /ap/activities/:id` route serving a dereferenceable activity document (mirrors
// post-uris.mts's rationale: nothing in this app currently needs an activity to be
// dereferenceable, only globally unique and stable for the lifetime of a delivery).
export function getActivityUri(activityId: string): string {
  return getSiteUrl(`/ap/activities/${activityId}`)
}
