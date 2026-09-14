// Cache-Tag scheme for Cloudflare Workers Cache tag-based purge (GA). Imported by both
// `CachedOrigin` (cloudflare-worker, mints tags from the dispatched request's URL) and the
// backend (`@services/entity-cache/invalidate.mts`, mints tags from entity IDs/slugs on
// mutation and POSTs them to `/infra/cache-purge`) so tag strings can never drift.
//
// The backend already resolves BOTH the UUID and every known slug/alias for an entity at
// invalidation time (see `@services/entity-cache/keys.mts`), so it purges every tag form.
// `CachedOrigin` only ever sees the dispatch URL, so it mints a tag from whichever
// identifier literally appears in the path — no DB lookup needed, Workers-safe — and the
// backend's dual-form purge guarantees whichever form was cached still gets purged.
//
// Both sides mint through `cacheTag()` (cache-tag-encoding.mts), which normalizes then
// percent-encodes a raw identifier. `deriveEntityCacheTags` decodes the edge's `URL.pathname`
// segments first, so both sides hand `cacheTag()` the same raw value and collapse onto one
// canonical, Cloudflare-legal string. That decode lives here, at the one place a percent-encoded
// identifier originates, and deliberately not inside the encoder — see
// `decodeCacheTagPathSegment`.

import { cacheTag, decodeCacheTagPathSegment } from './cache-tag-encoding.mts'

export const postTag = (idOrSlug: string): string => cacheTag('post', idOrSlug)
export const topicTag = (idOrSlug: string): string => cacheTag('topic', idOrSlug)
export const userTag = (idOrSlug: string): string => cacheTag('user', idOrSlug)
export const communityTag = (idOrSlug: string): string => cacheTag('community', idOrSlug)
export const listTag = (id: string): string => cacheTag('list', id)
export const storyTag = (id: string): string => cacheTag('story', id)
export const hostnameTag = (idOrHostname: string): string => cacheTag('hostname', idOrHostname)
export const rssFeedTag = (id: string): string => cacheTag('rss-feed', id)
export const rssFeedItemTag = (id: string): string => cacheTag('rss-feed-item', id)
// No electionTag: "election" (vote summary/tally) is never a URL-addressable entity in this
// codebase — it's always a sub-resource embedded on its owning post/topic/user/comment's own
// detail page (see docs/requirements/ENTITY-ACTION-MATRIX.md), so minting an election:<id> tag
// would be unreachable dead code (no cached response is ever tagged that way).
//
// Vote/election mutations are also intentionally NOT wired to purge the owning entity's
// post:/topic:/user: tag (see @services/entity-cache/invalidate.mts): votes are far
// higher-frequency than content edits, and purging the full cached HTML page on every vote
// would fight the point of caching. Vote-count staleness on cached pages self-heals within the
// existing anon TTL window instead.

export const SITEMAP_TAG = 'sitemap'
export const RSS_TAG = 'rss'
export const STATIC_TAG = 'static'
// Fallback for any cacheable page that isn't a single-entity detail page (home, search,
// list/collection pages such as /reviews or /cards). These are high-cardinality and don't
// map to one entity, so they share one coarse, purge-by-tag-able class instead of being
// left untagged.
export const HTML_TAG = 'html'

// Detail-route type-slug sets, used to classify the first path segment of a request into
// an entity family. Kept in sync manually with the routing tables that actually mint these
// URLs — there is no single canonical source shared by both sides (see the files below), so
// treat this as a ripple site: when adding/removing a `post_type` or `topic_type` route
// slug, update this set too (see docs/development/finite-enum-ripple-checklist.md).
//   - posts: web/app/(posts)/*/[id]/page.tsx route dirs. `story` posts' canonical
//     generated links collapse onto the `discussion` path (see web/lib/post-helpers.ts's
//     POST_TYPE_PATHS), but `/story/:id` is a separate, independently reachable Next.js
//     route (web/app/(posts)/story/[id]/page.tsx) that also renders story posts directly,
//     so it needs its own slug here to stay purge-precise.
//   - topics: backend/types/entities/topic.mts's topicTypes[*].slug
export const POST_TYPE_SLUGS: ReadonlySet<string> = new Set([
  'discussion',
  'story',
  'review',
  'data-point',
  'topic-recommendations',
  'article',
  'blog-post',
  'link',
])

export const TOPIC_TYPE_SLUGS: ReadonlySet<string> = new Set([
  'topic',
  'rewards-program',
  'rewards-program-status',
  'referral-program',
  'card',
  'bank-account',
  'source',
])

// Plural resource-collection family names shared by both `/api/v1/<family>/:idOrSlug`
// (`backend/api/v1/{posts,topics,users,hostnames,rss-feeds,rss-feed-items}/*.mts`) and
// `/md/<family>/:idOrSlug` (`backend/md/{posts,topics,users}.mts`) detail-route registrations.
// Distinct from the web route's per-type slug vocabulary (POST_TYPE_SLUGS / TOPIC_TYPE_SLUGS) —
// neither the API nor the markdown routes route through a post/topic type slug. rss-feeds and
// rss-feed-items have no `/md/*` counterpart today; that's fine — this map is a lookup table for
// both branches, not a claim that every family exists in both.
const PLURAL_FAMILY_TAG: Readonly<Record<string, (idOrSlug: string) => string>> = {
  posts: postTag,
  topics: topicTag,
  users: userTag,
  communities: communityTag,
  lists: listTag,
  stories: storyTag,
  hostnames: hostnameTag,
  'rss-feeds': rssFeedTag,
  'rss-feed-items': rssFeedItemTag,
}

// Static, non-entity API subroutes registered directly under a family at the same path depth
// as a detail route (`/api/v1/<family>/<literal>`, no real id/slug) — e.g.
// `backend/api/v1/topics/compare.mts`'s `/api/v1/topics/compare`. Without this denylist,
// deriveEntityCacheTags would mistake the literal segment for an idOrSlug and mint an
// unpurgeable tag (no mutation ever targets a topic literally named "compare"), so the cached
// response could only ever go stale via TTL, never active purge. Ripple site: add new literal
// (non-`:idOrSlug`) `/api/v1/<family>/<literal>` route registrations here (see
// docs/development/finite-enum-ripple-checklist.md). Only applies to `/api/v1/*` — `/md/*`
// routes have no equivalent literal subroutes today.
const API_FAMILY_STATIC_SUBROUTES: Readonly<Record<string, ReadonlySet<string>>> = {
  topics: new Set(['compare', 'publisher-types', 'aliases']),
  communities: new Set(['invite-redemptions']),
  lists: new Set(['contains']),
  hostnames: new Set(['top', 'compare', 'social', 'blocked']),
  'rss-feeds': new Set(['trending', 'recommended']),
}

// `.md` alias routes (`cloudflare-worker/src/markdown-aliases.mts`) rewrite web paths like
// `/discussion/abc.md` to a markdown origin path, but the *client-facing* pathname this module
// classifies still ends in `.md`. Strip it before matching so the minted tag matches the real
// entity id/slug (e.g. `post:abc`, not the unpurgeable `post:abc.md`).
function stripMarkdownExtension(idOrSlug: string): string {
  return idOrSlug.endsWith('.md') && idOrSlug.length > 3 ? idOrSlug.slice(0, -3) : idOrSlug
}

// Classifies a request path into entity Cache-Tags without a DB lookup. Handles three distinct
// route shapes:
//   - web: first segment selects the entity family (user / domain / post-type slug /
//     topic-type slug), second segment is the id-or-slug (e.g. `/discussion/slug`,
//     `/user/alice`, `/domain/example.com`), which may carry a `.md` alias suffix (see
//     `stripMarkdownExtension`).
//   - backend API: `/api/v1/<family>/<idOrSlug>` (e.g. `/api/v1/posts/:idOrSlug`) — anon/bot
//     GETs to these are cacheable (see cache-policy.mts's getCachePolicy, no /api/* exemption),
//     so they need the same precise purge-on-mutation as their web-route counterparts.
//   - backend markdown routes: `/md/<family>/<idOrSlug>` (`backend/md/{posts,topics,users}.mts`)
//     — always publicly cacheable detail pages, same family vocabulary as the API routes.
// Extra path depth after the id (tabs/sub-pages/sub-resources, e.g. `/user/alice/reviews` or
// `/api/v1/posts/:id/images`) is ignored — the tag still targets the owning entity.
// Returns [] when the path isn't a recognized single-entity detail page.
//
// Future constraint (#6994): the web-route branch assumes the family is always the first path
// segment. If locale-prefixed routes (e.g. `/en/discussion/slug`) ship, `en` would misclassify
// as the family, this would return [] for every locale-prefixed entity page, and those pages
// would fall through to the coarse HTML_TAG instead of their precise entity tag — losing
// tag-based purge on mutation. Not reachable today (SUPPORTED_UI_LOCALES is `['en']`, so no
// locale prefix exists yet); strip any locale prefix from `pathname` here when locale-prefixed
// routing ships.
export function deriveEntityCacheTags(pathname: string): string[] {
  // Decode per segment, never the whole pathname: an identifier containing a literal `/` reaches
  // the edge as `%2F`, which `URL.pathname` leaves encoded, and decoding before the split would
  // manufacture a segment boundary that the route never had. Family and static-subroute segments
  // decode too, so `%63ompare` classifies the same as `compare` rather than slipping past the
  // denylist as an unpurgeable entity tag.
  const segments = pathname.split('/').filter(Boolean).map(decodeCacheTagPathSegment)
  if (segments.length < 2) return []
  if (segments[0] === 'api' && segments[1] === 'v1') {
    if (segments.length < 4) return []
    const [, , family, idOrSlug] = segments
    if (API_FAMILY_STATIC_SUBROUTES[family]?.has(idOrSlug)) return []
    const tagFn = PLURAL_FAMILY_TAG[family]
    return tagFn ? [tagFn(idOrSlug)] : []
  }
  if (segments[0] === 'md') {
    if (segments.length < 3) return []
    const [, family, idOrSlug] = segments
    const tagFn = PLURAL_FAMILY_TAG[family]
    return tagFn ? [tagFn(idOrSlug)] : []
  }
  const [family, rawIdOrSlug] = segments
  const idOrSlug = stripMarkdownExtension(rawIdOrSlug)
  if (family === 'landing') return [userTag(idOrSlug)]
  if (family === 'communities') return [communityTag(idOrSlug)]
  if (family === 'user') return [userTag(idOrSlug)]
  // web/app/(topics)/domain/[id]/page.tsx renders hostname data (domainHref() links to it by
  // hostname string, e.g. `/domain/example.com`), so it shares the hostname family with the
  // `/api/v1/hostnames/:id` API route rather than falling through to the coarse HTML_TAG.
  if (family === 'domain') return [hostnameTag(idOrSlug)]
  if (POST_TYPE_SLUGS.has(family)) return [postTag(idOrSlug)]
  if (TOPIC_TYPE_SLUGS.has(family)) return [topicTag(idOrSlug)]
  return []
}

export interface CacheTagRouteContext {
  isSitemap: boolean
  isRss: boolean
  isStatic: boolean
}

// Full Cache-Tag derivation for a cacheable response: precise entity tag(s) for detail
// pages, otherwise a coarse class tag. `context` carries route classification the caller
// already computed (cloudflare-worker's routing.mts/cache-policy.mts own that regex
// knowledge — this module only owns what the tag strings mean).
export function deriveCacheTags(pathname: string, context: CacheTagRouteContext): string[] {
  const entityTags = deriveEntityCacheTags(pathname)
  if (entityTags.length > 0) return entityTags
  if (context.isSitemap) return [SITEMAP_TAG]
  if (context.isRss) return [RSS_TAG]
  if (context.isStatic) return [STATIC_TAG]
  return [HTML_TAG]
}
