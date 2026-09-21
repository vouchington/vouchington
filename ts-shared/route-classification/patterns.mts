import {
  PRIVATE_USER_PROFILE_COLLECTIONS,
  getProfileCollectionRouteSuffix,
} from '@ts-shared/user-profile-collections'

/**
 * Canonical route-classification patterns shared across cloudflare-worker, web, and backend.
 *
 * Private paths (denylist) — any path matching these must never appear in discovery surfaces
 * (Link headers, /llms.txt, /.well-known/api-catalog).
 *
 * Public paths (allowlist) — static path sets consumed by the web app's site-navigation schema
 * and by tests that assert the private/public invariant.
 *
 * Robots prefixes — the subset of private prefixes that robots.txt should disallow.
 */

// ---------------------------------------------------------------------------
// Private paths — exact matches
// ---------------------------------------------------------------------------

export const PRIVATE_DISCOVERY_EXACT_PATHS: ReadonlySet<string> = new Set([
  '/admin',
  '/agents',
  '/api',
  '/auth',
  '/crm',
  '/curated-asides',
  '/feed',
  '/growth',
  '/infra',
  '/login',
  '/memberships/grants',
  '/messages',
  '/monitoring',
  '/my',
  '/disputes',
  '/posts/review-queue',
  '/reports',
  '/report-integrity',
  '/rss-feed-categories',
  '/sideload',
  '/storybook',
  '/support',
  '/topic-recommendations',
  '/topics/aliases',
  '/topics/create',
  '/urls',
  '/users',
  '/vote-integrity',
])

// ---------------------------------------------------------------------------
// Private paths — prefix matches (lowercase, trailing slash required)
// ---------------------------------------------------------------------------

export const PRIVATE_DISCOVERY_PREFIXES: readonly string[] = [
  '/_next/',
  '/admin/',
  '/agent/',
  '/agents/',
  '/api/',
  '/auth/',
  '/chat/',
  '/crawler/',
  '/crm/',
  '/curated-asides/',
  '/disputes/',
  '/feed/',
  '/growth/',
  '/infra/',
  '/login/',
  '/memberships/grants/',
  '/messages/',
  '/monitoring/',
  '/my/',
  '/posts/review-queue/',
  '/reports/',
  '/report-integrity/',
  '/rss-feed-categories/',
  '/sideload/',
  '/storybook/',
  '/support/',
  '/topic-recommendations/',
  '/topics/aliases/',
  '/topics/create/',
  '/urls/',
  '/users/',
  '/vote-integrity/',
]

// ---------------------------------------------------------------------------
// Private paths — dynamic regex patterns
// ---------------------------------------------------------------------------

/** Settings, tags, and validations pages for topic-type entities. */
export const PRIVATE_TOPIC_MANAGEMENT_RE: RegExp =
  /^\/(bank-account|card|referral-program|rewards-program|rewards-program-status|source|topic)\/[^/]+\/(settings|tags|validations)(?:\/|$)/

/* c8 ignore start -- covered by focused route-classification tests outside pre-push's backend sample. */
export const PRIVATE_USER_PROFILE_COLLECTION_ROUTE_SUFFIXES = PRIVATE_USER_PROFILE_COLLECTIONS.map(
  getProfileCollectionRouteSuffix,
)

const PRIVATE_USER_PROFILE_COLLECTIONS_RE = new RegExp(
  `^/user/[^/]+/(?:${PRIVATE_USER_PROFILE_COLLECTION_ROUTE_SUFFIXES.map(RegExp.escape).join('|')})(?:/|$)`,
)
/* c8 ignore stop */

/** All other private dynamic routes (edit/create/settings/admin sub-pages). */
export const PRIVATE_DYNAMIC_ROUTE_PATTERNS: readonly RegExp[] = [
  /^\/(article|blog-post|data-point|discussion|review|story)\/[^/]+\/(edit|tags)(?:\/|$)/,
  /^\/(articles|blog|data-points|discussions|links|reviews)\/create(?:\/|$)/,
  /^\/communities\/[^/]+\/settings(?:\/|$)/,
  /^\/communities\/[^/]+\/(apply|posts\/create)(?:\/|$)/,
  /^\/communities\/(create|invite)(?:\/|$)/,
  /^\/url\/[^/]+(?:\/crawls\/[^/]+)?(?:\/|$)/,
  /^\/user\/[^/]+\/admin(?:\/|$)/,
  PRIVATE_USER_PROFILE_COLLECTIONS_RE,
]

// ---------------------------------------------------------------------------
// Public paths — static site navigation paths (used by web schema + tests)
// ---------------------------------------------------------------------------

export const PUBLIC_STATIC_SITE_NAV_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/articles',
  '/blog',
  '/cards',
  '/channels',
  '/communities',
  '/data-points',
  '/discussions',
  '/domains',
  '/domains/compare',
  '/news',
  '/news-sources',
  '/plans',
  '/podcast-episodes',
  '/podcasts',
  '/posts',
  '/referral-programs',
  '/reviews',
  '/rewards-program-statuses',
  '/rewards-programs',
  '/sources',
  '/spending-categories',
  '/stories',
  '/topics',
  '/videos',
  '/web-search',
])

/** Topic sub-page slugs that are publicly indexable. */
export const INDEXABLE_TOPIC_SUBPAGES: ReadonlySet<string> = new Set([
  'data-points',
  'latest',
  'news',
  'posts',
  'referral-links',
  'reviews',
])

/** Community slug segments reserved for non-community pages (must not be treated as community slugs). */
export const COMMUNITY_PUBLIC_RESERVED_SEGMENTS: ReadonlySet<string> = new Set(['create', 'invite'])

// ---------------------------------------------------------------------------
// Robots.txt — paths to disallow for all crawlers
// ---------------------------------------------------------------------------

/** Paths, path prefixes, or `$`-anchored exact paths to include in robots.txt Disallow directives. */
export const ROBOTS_DISALLOW_PREFIXES: readonly string[] = [
  '/admin/',
  '/api/',
  '/auth/',
  '/chat/',
  '/feed/',
  '/login',
  '/messages/',
  '/messages?',
  '/messages$',
  '/my/',
  '/support/',
  '/support?',
  '/support$',
]
