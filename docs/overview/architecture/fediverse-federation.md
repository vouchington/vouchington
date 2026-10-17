# Fediverse Federation

The fediverse surface started as live-queried search (see FEDIVERSE.md).
Voucha now also serves WebFinger, NodeInfo, an ActivityPub actor and a signature-verified inbox,
delivers follow and like activities to remote followers, and links Bluesky accounts to reconcile
user follows. It does not publish Voucha posts or create Bluesky likes.

- [Protocol reality](reference-fediverse-federation-protocol-reality.md) covers what the protocols
  allow, how the existing model maps onto them, and the persistence boundary.
- [Constraints that bind every phase](reference-fediverse-federation-constraints-that-bind-every-phase.md)
  records the rules any federation change must keep.
