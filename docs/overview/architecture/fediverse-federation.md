# Fediverse Federation

The fediverse surface began as search-only — a live-queried aggregator, not protocol federation (see
[FEDIVERSE.md](../../requirements/content/FEDIVERSE.md)). This doc is the roadmap and technical
design for the four dependency-sequenced phases that turn it into a real federation participant: A
(real inbound search) → B (instance directory + voting) → C (outbound ActivityPub) → D (Bluesky
account-linking). All four phases have shipped: Voucha now serves WebFinger, NodeInfo, an AP actor
document, and a signature-verified inbox, and delivers outbound follow/like activities to remote
followers. Phase D links Bluesky accounts and reconciles user follows. It does not publish Voucha
posts or create Bluesky likes. This document preserves the reuse targets and constraints so they do
not need to be re-derived.

## Contents

- <a id="protocol-reality"></a>[Protocol reality](reference-fediverse-federation-protocol-reality.md)
- <a id="how-the-existing-model-maps-reuse-targets"></a>[How the existing model maps (reuse targets)](reference-fediverse-federation-protocol-reality.md#how-the-existing-model-maps-reuse-targets)
- <a id="persistence-boundary"></a>[Persistence boundary](reference-fediverse-federation-protocol-reality.md#persistence-boundary)
- <a id="constraints-that-bind-every-phase"></a>[Constraints that bind every phase](reference-fediverse-federation-constraints-that-bind-every-phase.md)
- <a id="phase-a--real-inbound-search-all-four-platforms--lemmy--shipped"></a>[Phase A — Real inbound search (all four platforms, + Lemmy) — Shipped](reference-fediverse-federation-constraints-that-bind-every-phase.md#phase-a--real-inbound-search-all-four-platforms--lemmy--shipped)
- <a id="phase-b--instance-directory-fediverse_instance-topic-type-voting-admin-allowlist--shipped"></a>[Phase B — Instance directory (`fediverse_instance` topic type, voting, admin allowlist) — Shipped](reference-fediverse-federation-constraints-that-bind-every-phase.md#phase-b--instance-directory-fediverse_instance-topic-type-voting-admin-allowlist--shipped)
- <a id="phase-c--outbound-activitypub-resurrect-the-removed-federation-server--shipped"></a>[Phase C — Outbound ActivityPub (resurrect the removed federation server) — Shipped](reference-fediverse-federation-phase-c-outbound-activitypub-resurrect-the-removed-federation-server-shipped.md)
- <a id="phase-d--bluesky-account-linking-and-follow-propagation--shipped"></a>[Phase D — Bluesky account-linking and follow propagation — Shipped](reference-fediverse-federation-phase-d-bluesky-account-linking-and-follow-propagation-shipped.md)
- <a id="verification"></a>[Verification](reference-fediverse-federation-phase-d-bluesky-account-linking-and-follow-propagation-shipped.md#verification)
- <a id="related"></a>[Related](reference-fediverse-federation-phase-d-bluesky-account-linking-and-follow-propagation-shipped.md#related)
