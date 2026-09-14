// Canonical Cache-Tag encoding shared by the two sides of the purge scheme.
//
// Cloudflare's Workers Cache purge API rejects any tag longer than 1024 bytes or carrying a
// byte outside printable ASCII excluding space (0x21-0x7E), and a single invalid tag fails the
// entire batch with a generic rejection. Identifiers reaching `cacheTag()` are arbitrary
// human-entered text — `topic_aliases.alias` is validated only for length (see
// `@services/topics/alias-preflight.mts`), so spaces and non-ASCII routinely survive into it.
//
// The two sides also observe the same identifier in different forms: `CachedOrigin` reads it
// from `URL.pathname`, which is always percent-encoded ASCII, while the backend reads the raw
// value straight from Postgres. Only the URL-derived form is decoded, by its own caller
// (`deriveEntityCacheTags`), before it reaches `cacheTag()`. Both sides therefore hand this
// encoder the same raw identifier, so `/topic/caf%C3%A9` and the row `café` mint the same tag.
//
// `cacheTag()` must never decode on its own behalf. A raw alias may contain a valid escape
// sequence — `alias` is length-validated only, so `sale%20day` is a legal row — and decoding it
// would yield `sale day` on the backend while the edge, reading the doubly-escaped pathname
// `sale%2520day`, yielded `sale%20day`. The two tags would differ and nothing would ever purge
// that entity. Decode exactly once, where a percent-encoded form actually originates.

import { normalizeKey } from '@ts-shared/utils/strings'

export const MAX_CACHE_TAG_BYTES = 1024

// Encoded tags are pure ASCII, so string length and byte length are the same measure here.
const CACHE_TAG_CHARSET = /^[!-~]+$/

// True when Cloudflare accepts `tag`. Everything `cacheTag()` mints satisfies this by
// construction; the worker's purge route re-checks inbound tags so a malformed caller gets an
// actionable 400 rather than an opaque 502 that the backend retries as if it were transient.
export function isValidCacheTag(tag: string): boolean {
  return tag.length > 0 && tag.length <= MAX_CACHE_TAG_BYTES && CACHE_TAG_CHARSET.test(tag)
}

// Recovers the raw identifier from one `URL.pathname` segment, which is the only percent-encoded
// form either side observes. Call it on URL-derived input and nothing else: applied to a raw
// database value it would silently rewrite any legal `%XX` the value contains.
//
// A malformed escape (`%zz`, a truncated `%a`) makes the segment undecodable; keep it verbatim
// rather than throwing, since `encodeCacheTagValue` then re-escapes the `%` to `%25` — which is
// exactly what the backend mints for a raw value spelled that way.
export function decodeCacheTagPathSegment(segment: string): string {
  if (!segment.includes('%')) return segment
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// `encodeURIComponent` escapes every byte outside `A-Za-z0-9-_.!~*'()`, which is exactly the
// guarantee this scheme needs: spaces, control characters and all non-ASCII become `%XX`.
// Escaping the comma matters beyond validity — it delimits the `Cache-Tag` response header, so
// an unescaped one would split one tag into two. The trailing lowercase fixes the hex digits'
// case so both runtimes produce byte-identical output. `idOrSlug` is always a raw identifier —
// see `decodeCacheTagPathSegment` for why this must not decode it first.
export function encodeCacheTagValue(idOrSlug: string): string {
  return encodeURIComponent(normalizeKey(idOrSlug)).toLowerCase()
}

// Truncates rather than drops an over-long tag. Dropping would desynchronize the two sides —
// the edge falls through to `HTML_TAG` when no entity tag is minted, while the backend would
// purge nothing — whereas an identical truncation on both sides still matches. Two identifiers
// sharing a 1024-byte prefix then collapse onto one tag, which over-purges; that is safe, where
// the under-purge caused by dropping is not. Cuts on an escape boundary so a `%XX` triple is
// never split into a different tag than the other side would produce.
function truncateCacheTag(tag: string): string {
  if (tag.length <= MAX_CACHE_TAG_BYTES) return tag
  let end = MAX_CACHE_TAG_BYTES
  if (tag[end - 1] === '%') end -= 1
  else if (tag[end - 2] === '%') end -= 2
  return tag.slice(0, end)
}

// Builds `<family>:<canonical value>`. The family prefix is a fixed ASCII literal owned by
// `cache-tags.mts`, so only the caller-supplied value needs encoding.
export function cacheTag(family: string, idOrSlug: string): string {
  return truncateCacheTag(`${family}:${encodeCacheTagValue(idOrSlug)}`)
}
