import { getSiteOrigin, getSiteUrl } from '@modules/utils'

// A local post's ActivityPub identity. Pure URI shape only — there is no `GET /ap/posts/:id`
// route serving a dereferenceable Note document (see fediverse-federation.md: the outbox never
// publishes posts as AP objects, and that boundary does not move). This exists solely so an
// inbound Like/Undo(Like)'s `object` field can be resolved back to a local postId; a future phase
// may or may not ever serve this URI.
export function getPostUri(postId: string): string {
  return getSiteUrl(`/ap/posts/${postId}`)
}

const POST_URI_ID_PATTERN = /^\/ap\/posts\/([^/]+)$/

// Recovers the postId from one of our own post URIs (e.g. to resolve the target of an inbound
// Like/Undo(Like)). Returns undefined for any URI that isn't a local post URI in our own shape,
// including a URI on a different hostname that merely reuses our `/ap/posts/:id` path shape.
export function parseLocalPostUriId(postUri: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(postUri)
  } catch {
    return undefined
  }
  if (parsed.hostname !== new URL(getSiteOrigin()).hostname) return undefined
  return POST_URI_ID_PATTERN.exec(parsed.pathname)?.[1]
}
