# @modules/activitypub-uris

Canonical ActivityPub URI builders for local actors. Centralizes the actor identity shape so it
can only be constructed one way.

## Rules

- Actor identity is always the stable `userId` — `getActorUri(userId)` builds `/ap/users/:userId`.
  There is no `getActorUriFromUsername`; `username` is mutable and must never appear in an actor,
  keyId, inbox, outbox, or followers/following URI.
- `username` is allowed in exactly one place: `getWebfingerAcct(username)`, which builds the
  `acct:username@hostname` alias remote servers resolve via WebFinger to discover the actor's real
  (userId-based) URI. WebFinger is a lookup alias, not the actor's identity.
- `getActorKeyId(userId)` is the `keyId` advertised on the actor document and expected in the
  HTTP Signature `keyId` parameter (`@modules/http-signatures`).
- `getPostUri(postId)` / `parseLocalPostUriId(uri)` build/parse a local post's ActivityPub id
  shape (`/ap/posts/:postId`), used only to resolve an inbound Like/Undo(Like)'s `object` back to
  a local post. Pure URI shape — there is no route serving a document at this URI; the outbox
  never publishes posts as AP objects (see fediverse-federation.md).

## Related

- Backend rules: [../../CLAUDE.md](../../CLAUDE.md)
- Fediverse federation roadmap: [../../../docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md)
- HTTP Signatures: [../http-signatures/README.md](../http-signatures/README.md)
