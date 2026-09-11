# SEO Requirements

## Public Pages

Public, crawlable pages must include:

- A descriptive title
- A meta description
- A canonical URL
- Open Graph metadata
- Twitter card metadata
- A visible `h1`

## Internal Pages

Internal, authenticated, or operational pages must be `noindex, nofollow`.

This includes:

- `/feed/*`
- `/my/*`
- `/login`
- `/auth/*`
- `/admin/*`
- Post creation and edit flows
- Tag management pages

## Sitemap Alignment

Web indexability must stay aligned with sitemap eligibility.

- `votes_score_net > 0` means a post is indexable and may appear in the sitemap
- `votes_score_net <= 0` means a post must be `noindex` and must not appear in the sitemap

Do not change one side without changing the other.

## Breadcrumbs

All public pages must have:

- **Visible breadcrumb navigation**: A `<Breadcrumbs>` component rendered above the `<h1>` tag using items from `web/lib/seo/structured-data.ts`
- **JSON-LD BreadcrumbList schema**: Generated via `createBreadcrumbSchema()` and wrapped in a `StructuredDataScript` component

The home page is the root and does not need breadcrumbs. `/plans` is the other explicit exception: it remains a public SEO-indexable utility/marketing page, but it intentionally omits visible breadcrumbs and `BreadcrumbList` JSON-LD. It must still render the anonymous `SiteNavigationElement` structured data.

Example:

```tsx
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data'
import { StructuredDataScript } from '@/components/seo/structured-data-script'

const breadcrumbItems = [
  { name: 'Home', path: '/' },
  { name: 'Reviews', path: '/reviews' },
  { name: 'Amex Gold', path: '/review/amex-gold' },
]

// In JSX:
<StructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
<Breadcrumbs items={breadcrumbItems} />
```

## Structured Data

Add JSON-LD to public pages when relevant:

- Structured data must render only for anonymous viewers. Authenticated viewers must receive no JSON-LD on any route, including otherwise public pages.
- Every SEO-indexable public page must include `SiteNavigationElement` for the anonymous primary navigation. Use the shared public-nav config as the source of truth, and exclude footer/legal/auth-only/admin/feed links.
- Home page: `Organization`, `WebSite`
- Collection pages: `CollectionPage`, `BreadcrumbList`
- Topic pages: `Thing` or a category-specific schema.org type when category slugs are available; review pages include `AggregateRating` when ratings exist
- Post pages: `Article`, `BlogPosting`, `DiscussionForumPosting`, or `Review` with a category-specific `itemReviewed` type when available
- User profile pages: `ProfilePage` with `Person` mainEntity
- Community pages: `WebPage` with community name, description, URL, and `isPartOf` linking to the site; generated via `createCommunityPageSchema()` in `web/lib/seo/structured-data.ts`
- Comparison pages: `WebPage` with `about` array referencing both topic entities (typed via category-to-schema.org mapping) generated via `createComparisonPageSchema()`, and `BreadcrumbList` generated via `createBreadcrumbSchema()` in `web/lib/seo/structured-data.ts`
- User landing pages: `ProfilePage` via `PublicLandingPageView` component

**Category-to-Schema.org mapping** is maintained in `web/lib/seo/schema-org-types.ts` keyed by category slug.

### Required Schema Matrix

- Home page: `SiteNavigationElement`, `Organization`, `WebSite`
- Public collection pages: `SiteNavigationElement`, `CollectionPage`, `BreadcrumbList`
- Public post detail and comment permalink pages: `SiteNavigationElement`, post-specific schema, `BreadcrumbList`
- Public topic detail and indexable topic subpages: `SiteNavigationElement`, topic/topic-section schema, `BreadcrumbList`
- Public community detail/about pages: `SiteNavigationElement`, community `WebPage`, `BreadcrumbList`
- Public profile root and public landing pages: `SiteNavigationElement`, `ProfilePage`, `BreadcrumbList`
- Public comparison pages: `SiteNavigationElement`, comparison `WebPage`, `BreadcrumbList`
- Static public pages such as `/plans`: `SiteNavigationElement` plus any page-specific schema already required for that page

### Article and BlogPosting Recommended Properties

Per [Google's Article structured data guide](https://developers.google.com/search/docs/appearance/structured-data/article), article and blog post pages should include:

- `headline` — post title
- `description` / `articleBody` — excerpt or full content
- `datePublished` — creation timestamp
- `dateModified` — last update timestamp
- `url` — canonical post URL
- `author.name` — author username
- `author.url` — link to the author's profile page (recommended by Google)
- `image` — featured image or social card

### DiscussionForumPosting (Discussion Forum Schema)

Discussion, comment, and data-point posts use the [`DiscussionForumPosting`](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum) schema. Required and recommended properties:

**Required:**

- `headline` — post title
- `text` — post content excerpt (plain text, max 300 chars for comments)
- `datePublished` — ISO 8601 creation timestamp
- `author` — `Person` with `name` (omitted for anonymous posts)

**Recommended (included when data is available):**

- `dateModified` — ISO 8601 last-updated timestamp
- `url` — absolute canonical URL of the post
- `image` — first attached image URL (via `buildImagePath`)
- `comment` — array of nested `Comment` objects (up to 20 top-level comments), each with `text`, `datePublished`, and optional `author`
- `interactionStatistic` — array of `InteractionCounter` objects:
  - `LikeAction` — positive semantic trust-choice count
  - `CommentAction` — total descendant comment count

**Rules:**

- Anonymous posts/comments must omit the `author` field entirely
- Comment text is truncated to 300 characters
- Only the first 20 comments are included to keep payload size reasonable
- Comment permalink pages include their own reply descendants as nested `comment` objects

## Robots

- `robots.txt` must reference the sitemap
- `robots.txt` should disallow obvious internal route prefixes
- `robots.txt` must disallow: `/admin/`, `/api/`, `/auth/`, `/feed/`, `/login`, `/my/`
- `/md/` is intentionally crawlable because `/llms.txt` advertises public markdown endpoints for agents; non-public markdown responses must still return 404 from the backend.
- Route-level `noindex` is still required even when `robots.txt` disallows a path

## Machine-Readable Discovery

- `/llms.txt`, `/.well-known/api-catalog`, and HTTP `Link` headers must advertise only public unauthenticated resources.
- Do not include authenticated/private routes, internal URLs, or bearer-token query strings such as RSS `apikey`.
- RSS endpoints may support API keys for identity rate limiting, but discovery surfaces must use only anonymous public feed URLs.
- **Single source of truth**: route classification is centralized in `@ts-shared/route-classification`. The Cloudflare Worker imports `isPrivateDiscoveryPath` and `ROBOTS_DISALLOW_PREFIXES` from this package; the web app imports `PUBLIC_STATIC_SITE_NAV_PATHS`, `INDEXABLE_TOPIC_SUBPAGES`, and `COMMUNITY_PUBLIC_RESERVED_SEGMENTS`. When adding a new private route, update `ts-shared/route-classification/patterns.mts` — not the individual consumer files.

## What We Deliberately Do NOT Do (and Why)

These tactics are sometimes suggested for "AI SEO" but are **explicitly listed as misconceptions** in [Google's AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide):

- **No special `/llms.txt` optimization for Google AI Overviews** — Google says `/llms.txt` does not improve visibility in AI Overviews. Voucha does serve `/llms.txt` per the [llmstxt.org](https://llmstxt.org) spec as a discovery mechanism for `/md/*` routes, but this is not a Google AI ranking signal.
- **No "chunked" content for AI consumers** — violates the spirit of people-first content.
- **No per-query-variation pages** — classified as scaled content abuse.
- **No FAQPage/HowTo schemas invented for AI** — only add these where the page genuinely is an FAQ or how-to.

See also: [SEO-RESOURCES.md](./SEO-RESOURCES.md)

See also: [WEBSITE-SPECIFICATIONS.md](./WEBSITE-SPECIFICATIONS.md)

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
