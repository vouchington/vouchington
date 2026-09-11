# Posts

See also: [Entity × Action Matrix — post](../reference-post.md#post) · [Entity × Lifecycle Flow Matrix — post](../reference-posts.md#posts)

## Post Creation

Users can create any post type except `article` and `blog-post` as these are admin-only. This is a
structural service-layer rule before CAPTCHA and contribution-policy processing; community root
post types remain limited to their existing set even for admins.

Admin-created posts are trusted on create. They publish immediately with approved clearance and do
not run automated moderation, moderator-agent dispatch, community moderation prompts, or spam
detection on the create path. Non-admin posts still enter the normal automated clearance flow.

`topic_recommendation` is a special case: it reuses the shared post/election infrastructure but is only created and managed through the dedicated logged-in recommendation workflow, not the generic post composer or generic post listings.

To create a post, only the following are needed:

- `title` - optional
- `markdown` - required

Markdown mention syntax inside post titles and bodies:

- `@username` resolves to `/user/:username`
- `#topic` resolves to the canonical topic detail route
- `!post` accepts a post slug, post UUID, or same-site canonical post/comment URL
- Invalid mention-like text must remain plain text and must not create mention relations

For reviews, the following are required:

- `rating`
- `topic` - via an autocomplete dropdown

### Review Content Minimums

Review `markdown` bodies must meet all three minimums (measured on the raw source string, not `title` or `ai_summary_markdown`):

| Constant                | Default | Description             |
| ----------------------- | ------- | ----------------------- |
| `REVIEW_MIN_CHARACTERS` | `150`   | Minimum character count |
| `REVIEW_MIN_WORDS`      | `30`    | Minimum word count      |
| `REVIEW_MIN_SENTENCES`  | `3`     | Minimum sentence count  |

Administrators bypass these checks. All three constants are defined in `ts-shared/utils/validation.mts` and validated by `assertValidReviewContent()` in `backend/services/posts/validate-review-content.mts`. The same thresholds are mirrored in the review composer (`web/components/posts/post-form.tsx`) for live feedback and pre-submit validation.

## Broadcast & Privacy

All post types (except comments) support two visibility settings:

- **Broadcast** (`everyone` | `users` | `followers` | `mutual_followers`): Controls who sees the post in feeds and listings.
  - `everyone` (default): All users see the post in feeds and listings.
  - `users`: Only signed-in users see the post in feeds and listings. The page is still public when `privacy='public'`.
  - `followers`: Only the creator's followers see it in feeds.
  - `mutual_followers`: Only users who mutually follow the creator see it in feeds.
- **Privacy** (`public` | `private`): Controls who can access the post directly (by URL or search).
  - `public` (default): Anyone can view the post.
  - `private`: Only authorized users (based on broadcast setting), the creator, and admins can view it.

Posts and comments can also be marked anonymous:

- **Anonymous** (`is_anonymous`): Hides the author from everyone except the creator and admins.
- Anonymous posts do not appear on the creator's public `/user/:id/*` pages unless the viewer is the creator or an admin.

Constraints:

- `broadcast='everyone'` must always use `privacy='public'`.
- Comments always inherit `everyone`/`public` for broadcast/privacy. The root post's settings are enforced at query time.
- Private posts are completely hidden (no placeholder) from unauthorized users.
- Any post that is not `everyone` + `public` must be rendered with `noindex, nofollow` and excluded from sitemaps.

## Public Discovery Eligibility

Anonymous discovery is stricter than direct access. It requires approved, nondeleted, nonarchived
candidate and root rows; a public/everyone root; no active candidate or root author suspension; an
active public community publication when scoped; and a discoverable source for story posts. The
candidate/root split is material: comments inherit root audience and scope but keep their own
clearance and lifecycle state. Viewer-specific feeds/listings and direct links retain their own
author, member, follower, and staff rules. See [Public Post Eligibility](../../overview/architecture/reference-post-lifecycle-public-eligibility.md)
for the full matrix, controlled-system provenance, and checked-reader rule.

## Post Edit

The creator and admins can update the post. All of the above fields are valid, including `broadcast`, `privacy`, and `is_anonymous`. An Edit button is shown in `PostDetailActions` for `review`, `discussion`, `data_point`, `article`, and `blog_post` post types when the post response includes `can_edit_content=true` (author within 24h, or admin with no window). The button navigates to `/{postType}/{id}/edit`.

Post detail pages keep their title, badges, media thumbnails, rendered markdown, and metadata in a
server-rendered `PostDetailView`. The async `PostDetail` shell resolves the cached viewer and locale,
then passes projected data to the actions, overflow-menu, and image client islands. Those islands
must not receive the full post or user response, so anonymous HTML and crawler-visible content do
not depend on client JavaScript.

## Post Archive

The creator and admins can archive or unarchive a post from the edit page. The control is inside the
edit form's Advanced section because archiving is a rare management action. Archived posts are hidden
from public listings but remain accessible by direct link.

### Review succession

Publication reconciliation can archive an older root review only when a newer review by the same
author has the exact same nonempty topic set and is publicly eligible. See
[Review succession](reference-post-lifecycle-review-succession.md).

## Post Delete

A Delete button is shown in `PostDetailActions` for the post author or an admin. Clicking opens an `AlertDialog` confirmation; on confirm the post is deleted and the user is redirected to `/`. Community-moderator delete is deferred to #3363.

## Post Save

A Save/Unsave toggle (`EntityBookmarkButton`, predicate `save`) is shown in `PostDetailActions` and `PostCardFooter`. Signed-in users only. Allows bookmarking a post for later retrieval.

## Post Hide

A Hide/Unhide toggle (`HideButton`, predicate `hide`) is shown in `PostDetailActions` and `PostCardFooter`. Signed-in users only. Hides the post from the user's feed without affecting its visibility to others.

## Post Detail Personalization

- Logged-in post detail pages show a compact "From People You Follow" module for followed users who left positive or negative signals for the post.
- The module must be fetched asynchronously in React Server Components and omitted entirely for logged-out viewers.
- If the viewer does not follow anyone who left a positive or negative signal for the post, the module must not render at all.

### Negative-count visibility

Post negative counts are hidden from unpaid and public users. Topics, hostnames, RSS feed items, and other non-UGC content show negative counts to all users regardless of membership tier. Semantic controls do not render the aggregate net score.

## Post Card Label Layout

See [Post Anatomy — List-Item / Card Anatomy](../anatomy/post.md#list-item--card-anatomy).

The row uses `overflow-x-auto scrollbar-hide` with `flex gap-1` (single-line horizontal scroll, no wrapping). Share actions are pushed right with `ml-auto`.

## Post Detail Layout

All post types (review, discussion, story, data-point, article, blog-post) share **one component**
([`web/components/posts/post-detail.tsx`](../../../web/components/posts/post-detail.tsx)) rendered by
**one per-type route** (e.g. [`web/app/(posts)/review/[id]/page.tsx`](<../../../web/app/(posts)/review/[id]/page.tsx>)) backed by the shared factory in `web/lib/routes/post-route-factories.tsx`.
The only post-type-conditional UI permitted inside `PostDetail` is (a) the badge-strip review-rating
pills (review only) and (b) `DataPointDetail` (data-point only). New per-type UI must be added
outside `PostDetail`, rendered conditionally in the shared route. The "Posted by …" byline renders
below the markdown body, immediately above the action bar.

See [Post Anatomy — Detail Anatomy](../anatomy/post.md#detail-anatomy) for the element order (title,
badge strip, ratings, data-point metadata, author, images, body, action bar, referral links) and
sidebar aside composition.

Post detail comments show their count in the tab label: `Comments ({count})`. The count must use
the resolved UI locale number formatter, e.g. `Comments (1,000)` in English locales or
`Comments (1.000)` in locales that use period grouping.

### Typography

Admin posts and articles use `@tailwindcss/typography` (`prose prose-sm`) for formatted body rendering. The plugin must be registered in `globals.css` via `@plugin "@tailwindcss/typography"`.

## Post Detail Comment Form

The comment form is **always rendered** on post detail pages for logged-in users, even when the post has no comments yet. Unauthenticated users see a "Sign in to comment" prompt in its place.

## Post Form Layout

The post creation/edit form renders fields in this order:

1. Title
2. Data Point fields (data point posts only)
3. Topic & rating selectors (review posts only)
4. Related URLs
5. Images
6. Content (markdown textarea)
7. **Advanced** (collapsible — anonymous toggle, visibility selector) — always below Content
8. Submit / Cancel

### Review Form: Add Topic Behavior

Clicking **"Add Topic"** appends a new empty topic row **and immediately focuses its search input**. This removes the extra click of having to focus the newly-added field manually.

Implementation: `addReviewTopic` sets a `pendingFocusIndexRef` to the new array index; a `useEffect` watching `reviewTopics.length` reads that ref and calls `.focus()` on the appropriate `TopicAutocomplete` input after React re-renders the new row. A ref (not state) is used for the pending index so adding a row does not re-trigger focus on unrelated renders.

### Post Images

Images are managed via `web/components/shared/image-upload-button.tsx` (`ImageUploadButton`). The post form passes `multiple` and `maxFiles={20 - images.length}` to allow picking multiple files at once.

- **Multi-select**: the file picker accepts multiple files in a single selection. Files are validated individually; invalid files are skipped with a per-file error toast. Valid files are uploaded in parallel via `Promise.allSettled`.
- **Partial success**: if some files fail, successful uploads are still appended and a single aggregated error toast reports the failure count.
- **20-image cap**: the `maxFiles` prop slices the selection to the remaining available slots. The Add Image button is disabled when 20 images are already attached.
- **Compact list view**: the compact view shows only the first image as a thumbnail. The thumbnail has no `z-10` override so the card-level link overlay can cover it, making the thumbnail click navigate to the post detail.
- **Lightbox**: in the post detail view, clicking any image opens `PostImageLightbox`. See [Image Lightbox](../navigation/reference-components-context-aware-entity-labels.md#image-lightbox).

### Review Form: Topic & Image Row Alignment

Topic rows (bordered cards containing topic autocomplete + star rating + reorder chevrons) and Image rows (bordered cards containing image input + reorder chevrons) use `items-center` on their flex container. This keeps the content column vertically centered within the card, producing symmetric top and bottom padding regardless of the reorder chevron column height.

Do not change these rows to `items-start` — the chevron column (two 44px buttons ≈ 88px) is taller than the content column (≈ 72px), so `items-start` would float the content to the top and leave dead space at the bottom.

## Share And Send

Post cards and post detail pages expose follower distribution actions on the right side when all of the following are true:

- the viewer is logged in
- the viewer is not the post creator
- the post is top-level
- the post uses `privacy='public'` and `broadcast` is `everyone` or `users`

Actions:

- `Share with followers` queues feed-delivery events for the viewer's current followers so the post appears higher in their personalized feeds
- `Send to followers` opens a modal and queues notification events for either all current followers or a selected subset

Constraints:

- both actions are snapshot-based, chunked event fanout; followers added later do not receive past shares or sends
- users cannot share or send their own posts
- users cannot share or send comments
- selected recipients are found through cancellable, paginated server search and must contain 1–100 distinct users who currently follow the sender
- Web, Swift, and .NET expose the same actions and reset transient selection state when the viewer or post changes
- shared feed rows render `Shared by @username` attribution when shown in follower feeds

The `...` overflow kebab (top-right of post cards, share section on detail pages) also contains a **Report** option for signed-in viewers who are not the post creator. Clicking Report opens `ReportDialog`. See [REPORTING.md](../moderation/REPORTING.md).

## News-Item Discussions

News/RSS discussion has two native/web-equivalent actions:

- **Per-item Discuss**: `POST /api/v1/rss-feed-items/:id/discussions` creates a normal `link` post for the item's stored URL. No LLM or story discoverability gate is involved.
- **Cluster Discuss the full story**: `POST /api/v1/stories/:storyId/discussions` creates a `post_type='story'` post via the `@story-teller` system user. Aggregated, AI-summarized, skips most regular post moderation, and is gated by the source feed's `is_discoverable` flag.

The story route returns `403` with code `FEED_NOT_DISCOVERABLE` when the story's source feed is not discoverable; web falls back to a normal link post for the primary item. See [`backend/services/stories/CLAUDE.md`](../../../backend/services/stories/CLAUDE.md) and [`web/components/news/CLAUDE.md`](../../../web/components/news/CLAUDE.md).

## Moderation

Post moderation (delete, unpublish from community, archive, clearance, pin, and reporting) is governed by a two-tier model: global admin actions and community owner/moderator actions. Authorization rules, action semantics, API routes, audit trail tables, and known gaps are documented in [POST-MODERATION.md](../moderation/POST-MODERATION.md) — do not duplicate the matrix here.

## Related

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
- [Web rules](../../../web/CLAUDE.md) — post components and UI conventions
- [News component rules](../../../web/components/news/CLAUDE.md) — Discuss button bifurcation
- [Stories service rules](../../../backend/services/stories/CLAUDE.md) — discoverability gate and story-post pipeline
- [Posts service](../../../backend/services/posts/README.md) — business logic and lifecycle
- [Posts service rules](../../../backend/services/posts/CLAUDE.md) — service-specific coding rules
