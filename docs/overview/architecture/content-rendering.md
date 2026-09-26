# Content Rendering Rules

## Post Rendering by Author Type

- **Non-admin posts**: strict markdown (no raw HTML), `nofollow ugc` on external links, images proxied via the image host's `/sideload/` route
- **Admin posts**: markdown + sanitized HTML (permissive allowlist, no `<script>`/`<iframe>`/event handlers), dofollow external links (`rel="noopener"`), images proxied via the image host's `/sideload/` route

## Image Proxying

All browser-facing external `http(s)://` image URLs are rewritten to
`${IMAGE_ORIGIN}/sideload/{base64url}?w=1200&sig={hmac}`. Browsers therefore request the dedicated
image hostname directly, bypassing both the apex Cloudflare Worker and Next.js image optimization.

The `sig` parameter is an HMAC-SHA256 hex signature over the path `/sideload/{base64url}`, computed
using the newest key from `VOUCHA_SIDELOAD_SIGNING_KEYS`. When no keys are configured outside deployed
staging/production environments, the `sig` parameter is omitted for dev/test. In staging and production
the Lambda fails closed if signing keys are absent.

Markdown URL safety treats a colon as a scheme marker only before the first `/`, `?`, or `#`, so
relative links such as `/login?url=https://example.com` stay valid while unknown schemes are stripped.

### API-Level Proxying

Backend API responses proxy all external image URL fields through absolute `IMAGE_ORIGIN/sideload/` URLs before returning them to
the frontend. Key proxy sites:

- **Post/URL embeds** (`getUrlEmbedByUrlId`): `thumbnail_url` — width 640 px
- **URL crawl detail** (`GET /api/v1/urls/:id/crawls/:crawlId`): `og_image_sideload` — width 400 px
- **Entity-relation URL objects** (`entity-relations/query.mts`): `object_data.latest_crawl.image_url` — width 64 px
- **RSS feed item thumbnails** (`proxyThumbnailUrls`): returned as `rss_feed_item_thumbnail_url` map — width 400 px

`UrlEmbed` exposes safe display fields (`title`, `description`, and `provider_name`) selected by the
backend from normalized oEmbed data, then case-insensitive Open Graph and Twitter text as
applicable. Complete stored normalized `embed_metadata`, structured `meta_tags`, and crawl-local
oEmbed provenance are administrator-only. Raw values remain untrusted: presentation must never
render them as HTML or load raw image/player URLs. `thumbnail_url` and `player_url` remain the only
backend-approved URL projections. RSS response families expose the same contract through an
item-keyed `rss_feed_item_embeds` sidecar.

Raw external URLs are stored in the database; proxying happens at read time, so signing-key rotation
requires no backfill.

### Frontend Defense-in-Depth

All `next/image` usage must go through `ProxiedImage` from `web/components/shared/proxied-image.tsx`
instead of importing `next/image` directly. The wrapper calls `assertProxiedImageSrc()` in dev/test
mode, which throws if an external `src` does not have the exact configured `IMAGE_ORIGIN` origin.
Hostname-prefix lookalikes are rejected. Sideload URLs are rendered `unoptimized`, preserving their
signed query parameters and preventing routing through `/_next/image`. The assertion is a no-op in production and storybook browser mode
(`VITEST_STORYBOOK_BROWSER=1`). The `web-no-bare-next-image-import` / `web-no-bare-next-image-import-tsx`
ast-grep rules enforce the ban statically.

## Mentions

- **Validated mentions**: only parse mention syntax at safe token boundaries; do not parse emails, mid-word text, or other invalid mention-like strings
- **Mention routes**:
  - `@username` links to `/user/:username`
  - `#topic` links to the canonical topic route `/:topic-type-plural/:slug`
  - `!post` accepts a post slug, post UUID, or same-site canonical post/comment URL and resolves to a post detail page or comment permalink
- **Invalid mentions**: invalid or unresolved mention-like text stays as plain text and creates no mention relations

## RSS Feed Item Rendering

- **Modal (full content)**: Sanitized HTML via `sanitizeRssFeedItemContentHtml()` in
  `@services/rss-feed-items/sanitize-content-html`, rendered with `MarkdownContent` +
  `prose prose-sm max-w-none dark:prose-invert` styling. Content field priority:
  `content:encoded` → `content` → `description` → `summary`. Plain-text YouTube
  `media:description` is rendered by the modal text fallback so feed line breaks are preserved.
  Both the sanitized HTML path and the plain-text fallback set `lang`/`dir` from
  `rss_feed_items.lingua_rs_detected_language`, keeping original feed content outside the page UI
  language boundary.
- **YouTube metadata**: YouTube Atom `media:community` metrics are stored in the RSS item
  payload as `media:starRating` and `media:statistics`, and rendered as a dedicated YouTube
  metadata row separate from the publisher description.
- **Card (excerpt)**: Plain text via feedsmith's pre-stripped `contentSnippet` field or
  `stripHtmlTags()` (client-side parser-backed extraction) on snippet fields, including
  `media:description` for YouTube Atom feeds. Rendered with `line-clamp-3`.
  The excerpt sets `lang`/`dir` from `rss_feed_items.lingua_rs_detected_language`, keeping the
  original feed text outside the page UI language boundary.
- **Sanitization**: Rust `sanitizeRssHtml` uses Ammonia's allowlist-based sanitizer — strips
  `<script>`, `<style>`, `<iframe>`, form controls, event handlers (`on*` attrs),
  `javascript:`/`data:`/`vbscript:` URLs, `style`/`class`/`id` attributes, and unknown tags
  while preserving safe text/content; adds `rel="nofollow noopener"` + `target="_blank"` to
  links, `loading="lazy"` to images.
- **Batch**: List endpoints use `sanitizeRssFeedItemContentHtmlBatch()`, which chunks inputs
  to stay at or below the 10 MiB cap; this may result in multiple Rust N-API async batch
  sanitizer calls (one per chunk).
- **Image proxying**: Applied at API-response time. Rust rewrites `<img>` sources to the relative,
  signed `/sideload/{base64url}?w=1200&sig={hmac}` form so the HMAC covers only the request path.
  The backend serialization boundary then prepends the validated `IMAGE_ORIGIN` to those `src`
  attributes without changing the query string or other HTML bytes. Card thumbnails are proxied separately via
  `proxyThumbnailUrls()` (width 400 px), returned as a `rss_feed_item_thumbnail_url` map alongside
  the item entities. Raw URLs are kept in the DB; proxying happens at read time so key rotation
  requires no backfill.
- **Frontend defense-in-depth**: `MarkdownContent` sanitizes all HTML fragments through
  `web/lib/html/safe-html-fragment.ts` before either parsed React-node rendering or
  feature-enabled `dangerouslySetInnerHTML`. It preserves markdown/prose classes and safe
  structural attributes while blocking unsafe attributes/URL schemes if an upstream sanitizer
  regresses.
- **Pass budget**: RSS sanitization and markdown rendering avoid redundant HTML reparsing where
  possible; see [HTML And Markdown Rendering Passes](html-markdown-rendering-passes.md).
- **Thumbnail fallback**: When a feed item has no `itunes:image`/`media:thumbnail`, the ingester
  extracts the first external `<img src>` from `content:encoded` via `extractFirstImageSrc()` and
  stores it as `thumbnail_url`. New items populate naturally on re-poll; existing rows are not
  backfilled.

## Titles

Post titles are user-authored plain text. Post card and detail title elements set `lang` and `dir`
from the post's declared content language first, then detected language. The pending moderation queue
applies the same boundary to each pending post title. Empty-title fallback labels such as `Untitled
Discussion` are UI-owned text and are not marked as post content language.
Comment permalink root links wrap only the user-authored root post title or excerpt with content
`lang`/`dir`, leaving navigational link chrome outside that content-language boundary.

## Admin Detection

At render time via cached user roles (retroactive — demoting an admin changes rendering).

## Typography (Prose Styling)

Post body content is rendered with `prose prose-sm` classes from `@tailwindcss/typography`.

- The plugin is registered in `web/app/globals.css` via `@plugin "@tailwindcss/typography"` (Tailwind v4 syntax).
- Admin posts (`article`, `blog_post`) and any post with sanitized HTML benefit most from prose styling.
- The `prose` wrapper must be applied to the rendered HTML container in `PostDetail`.

## Native Client Rendering

Swift and .NET clients must render user/content HTML and markdown natively. Do not use `WebView`,
embedded web UI, or an open-web fallback for content parity unless the PR documents a concrete
blocker and links a replacement follow-up.

The approved YouTube/Vimeo embed-player exception is intentionally narrower than content
rendering: a dedicated, ephemeral player may load only backend-authorized
`www.youtube-nocookie.com/embed/…` or `player.vimeo.com/video/…` HTTPS URLs after an explicit Play
action. It is not a generic browser or HTML renderer, permits no injected scripts or bridge, blocks
unexpected top-level navigation, and is destroyed on dismissal. Client issue
[`vouchington/vouchington-clients#57`](https://github.com/vouchington/vouchington-clients/issues/57)
owns the implementation and replacement follow-up.

- Backend/web remains the canonical renderer. Native clients should prefer rendered HTML response
  fields and maps such as `html`, `markdown_to_html`, `body_html`, `content_html`, and `about_html`
  whenever the API provides them.
- Swift renders HTML fragments through `NativeHtmlContent`, backed by SwiftSoup parsing into a
  SwiftUI `AttributedString`/native text view tree. Markdown authoring uses `NativeMarkdownEditor`,
  which calls `POST /api/v1/markdown/preview` for preview mode and uses native API search for
  `@user`, `#topic`, and `!post` autocomplete.
- .NET renders HTML fragments through `NativeHtmlContentView`, backed by AngleSharp parsing into
  MAUI labels/spans/native layouts. Markdown authoring uses `NativeMarkdownEditorView` or
  `NativeMarkdownEditorDialog`, with the same preview endpoint and autocomplete sources.
- After a mutation has committed successfully, any follow-up preview rendering is best-effort. A
  preview failure must preserve the successful write and show the saved content or a fallback; it
  must not report the committed mutation as failed.
- Swift and .NET renderer suites must consume one canonical HTML fixture corpus. Platform-specific
  assertions may differ, but the shared inputs and expected semantics must cover soft breaks,
  nested lists, combined inline styles, tables, unsafe markup and URL schemes, images, absolute and
  relative links, and preformatted code.
- If an API surface only exposes raw markdown today, native clients may pass it as fallback text,
  but new API work should add rendered HTML parity instead of adding client-local markdown dialects.
- Static guardrails:
  `swift-native-no-raw-markdown-text`, `cs-native-no-raw-markdown-authoring`, and
  `xaml-native-no-raw-markdown-label` block new raw markdown/html display or authoring shortcuts.

## RSS Feed Rendering

### Posts RSS (`/rss/posts`)

- Post markdown is rendered to HTML using the same Rust NAPI renderer as web rendering
- Admin posts: `allowHtml: true`; raw HTML is allowed at the render step
- Non-admin posts: `allowHtml: false`, `nofollowLinks: true`
- Image proxying is disabled (`proxyImages: false`) — RSS readers need direct image URLs, not HMAC-signed `/sideload/` proxy URLs
- Mention resolution is skipped — RSS readers cannot navigate internal `@user` / `#topic` routes
- All rendered HTML is sanitized through `sanitizeRssHtml` as defense-in-depth; the sanitizer adds `rel="nofollow noopener"` and `target="_blank"` to **all** links regardless of the render-step `nofollowLinks` setting

### News RSS (`/rss/news`)

- External HTML from upstream RSS feeds (`content:encodedSnippet`, `contentSnippet`, `summary`, `description`) is sanitized through Ammonia-backed `sanitizeRssHtml`
- Removes `<script>`, `<style>`, `<iframe>`, `<form>`, event handlers, dangerous URL schemes (`javascript:`, `data:`, `vbscript:`)
- Strips `style`, `class`, `id`, `data-*` attributes, and unknown tags while preserving safe text/content
- Adds `rel="nofollow noopener"` and `target="_blank"` to links
- Adds `loading="lazy"` to images

### Safety Invariant

All RSS feed `<description>` content is wrapped in CDATA by the `feed` library, meaning raw HTML is preserved and rendered by RSS readers. Every description must be sanitized before reaching the XML builder.

## Batch Rendering

- `renderMarkdownBatch()` in `@services/markdown/batch-render` partitions entities by admin status
- Admin user lookup: `getAdminUserIdsFromPosts()` / `getAdminUserIdsFromEntities()` in `@services/markdown/admin-users` — uses cached user data, no extra DB queries

## Related

- [AI Agents](./ai-agents.md)
- [Auth Overview](./auth-overview.md)
- [HTML And Markdown Rendering Passes](./html-markdown-rendering-passes.md)
- [Markdown service](../../../backend/services/markdown/README.md) — Rust-backed markdown rendering pipeline
- [Backend rules](../../../backend/CLAUDE.md) — Rust NAPI usage, banned packages
- [Web rules](../../../web/CLAUDE.md) — content rendering components

## Post-authored text boundaries

Plain post titles and plain-text post projections render through `PostContentText`. It accepts the
text plus nullable `declared_language` and `lingua_rs_detected_language`, prefers the declared
language, and places `lang` and `dir` on the caller's semantic host without a wrapper. Blank text
uses its UI-owned fallback without either attribute.

`MarkdownContent` remains the boundary for rich post content. Reduced API projections that expose
post title or markdown must carry both language fields, and pass the resolved language to the rich
boundary. Native clients consume the same fields from `api-fixtures/v1` and apply direction at the
individual text or HTML leaf, never to an enclosing row.

Community about text is a separate plain-text boundary, `CommunityAboutCopy`. It uses the same
declared-then-detected rule with `default_language` and `lingua_rs_detected_language`, on both the
community card and the community about aside. It is not a post-content boundary.

Moderation report labels retain `target_label` for system-owned fallbacks. Post/comment authored
fragments travel separately as `target_content`; comment prefixes and deleted/private fallbacks
stay outside the authored boundary. Inputs, ARIA interpolation, metadata/routes, image alt text,
and non-post content classes are not post-content boundaries.
