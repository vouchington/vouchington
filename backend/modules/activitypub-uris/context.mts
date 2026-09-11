// The AS2 (ActivityStreams 2) + security-vocab JSON-LD context shared by every outbound
// ActivityPub document this app serves or sends — actor profiles (backend/api/activitypub/actor.mts)
// and outbound activities (@services/activitypub-delivery, Phase C4). A single frozen array keeps
// those two callers' context values from drifting apart.
export const AP_CONTEXT: readonly string[] = Object.freeze([
  'https://www.w3.org/ns/activitystreams',
  'https://w3id.org/security/v1',
])
