# Feed And List Filters

This document is the source of truth for feed, post/news list, topic-scoped list, and community-scoped list filter behavior.

## Route Surfaces

- `/feed` redirects to `/feed/posts`.
- `/feed/posts`, `/feed/posts/friends`, and `/feed/posts/topics` render the post feed experience.
- `/feed/news`, `/feed/news/friends`, `/feed/news/sources`, and `/feed/news/topics` render the news feed experience.
- `/feed/referral-links` (Following) and `/feed/referral-links/mutual` (Mutual Friends) render the referral links feed experience (auth-gated).
- Public post-type list pages (`/posts`, `/stories`, `/discussions`, `/reviews`, `/data-points`, `/articles`, `/blog`) render a post-type title route switcher.
- Public news (`/news`), `/sources`, topic-scoped post/news pages, and community-scoped post/news pages use the same combined text/topic search behavior.
- Community-specific feeds remain available from `/communities/:slug` and `/communities/:slug/news`; global feed pages must not expose a community selector.

## Feed Page Header

- Feed pages must not show byline copy such as "Content from topics and people you follow".
- Feed pages must render breadcrumbs above the title controls.
- Feed titles must be borderless, natural-width dropdown triggers:
  - `My Posts Feed` links to the post feed route group.
  - `My News Feed` links to the news feed route group.
  - `My Referral Link Feed` links to the referral links feed route group.
- Feed headers contain only breadcrumbs and the feed title route dropdown; feed subfilters do not sit beside the title.
- Feed subfilters (`All`, `Friends`, `Sources`, `Topics`) must be a natural-width dropdown in the filter control row, not tabs or pill strips.
- The canonical/default feed subfilter state is `All` (`/feed/posts` or `/feed/news`); Storybook examples for page top sections must show `All` by default unless the story is explicitly for a nested feed route.
- Feed dropdowns must conserve horizontal space and wrap cleanly on mobile.

## Post-Type Page Header

- Public post-type list titles must be natural-width borderless dropdown triggers.
- The title dropdown must switch between each public post type route: All, Stories, Discussions, Reviews, Data Points, Articles, and Blog. `/posts` is the canonical/default option and its dropdown label is `All`.
- Do not add explanatory bylines under these dropdown titles unless the page has a separate product requirement for them.

## Filter Controls

- List search forms must use the shared `ListFilters` composition and render a visible submit button with accessible name `Search`.
- The Sources page (`/sources`) renders a Publisher Type `Select` inline on the filter row; default label is `All Publisher Types`.
- Space-constrained lists may use an icon-only Search button, but the button must preserve a mobile-safe touch target.
- The submit button must render **after the sort dropdown** in DOM order (input → sort dropdown → submit button). The submit button uses `form={formId}` to reference the search form by ID so it can be placed outside the `<form>` element.
- Feed pages must not render a Post Type filter, including `/feed/posts`.
- Public post-type pages must not render a separate Post Type filter; users switch between All and specific post types through the title dropdown.
- Card/Compact or List/Compact display selection must be a natural-width dropdown using the shared view-mode component.
- View-mode icons must be consistent across post and news/feed surfaces.
- All filter-row interactive controls (search inputs, sort selects, dropdown triggers, submit buttons) must share the height token defined in `web/components/shared/filter-control-height.ts` (`h-11` on mobile, `sm:h-9` on desktop). Do not hardcode `h-11 sm:h-9` inline; import the shared constant.
- The view-mode dropdown trigger renders icon + chevron only; the visible mode label (Card/Compact) is placed in the menu items. The trigger's `aria-label` carries the mode text for screen readers.
- Filter rows span the full container width.
- The search submit button must be the LAST interactive control in the row. Order: text input → (optional filter children) → sort dropdown → submit button.
- Filter rows require vertical spacing below them; provide it by wrapping the filter + list pair in `<div className='space-y-4'>` in each page component.

## Combined Text And Topic Search

- Post, news, feed, topic-scoped, and community-scoped list pages must use one search input for both text and topic filtering.
- The placeholder must be `Search by text or #topic` on those surfaces.
- Typing `#` starts topic autocomplete.
- Pressing Enter while an autocomplete option is active must append the selected `#topic-slug` to the input instead of submitting immediately.
- Pressing Enter with no active autocomplete option submits the search.
- Submitting search resets cursor pagination by removing `after`.
- For surfaces that support multiple `#topic` tokens, two or more tokens are combined with AND semantics (the result must match all topics).
- The search input trims the query before URL serialization to prevent trailing `+` in the URL.
- A custom X clear button replaces the browser-native `type="search"` UA button. Clicking it clears the input and immediately submits the empty query so the URL updates.
- Backend parsers must treat `#topic-slug` tokens in `q` as topic filters and remove those tokens from the text search query.
- Canonical hashtags contain ASCII alphanumeric segments separated by `-`. Search and autocomplete
  normalize `.` and `_` to `-` so mobile input remains convenient.
- A linked hashtag matches direct categorization by its topic plus categorization by any hashtag
  alias linked to that topic. An unlinked hashtag matches its exact alias only. Unknown valid
  hashtags return an empty result; malformed hashtags return a recoverable validation error.

### Hashtag filter dimensions per surface

Each backend parser maps `#topic-slug` tokens to the correct SQL filter dimension for the relevant entity type:

| Surface           | Filter dimension            | Semantics                                                                             |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| Posts (all types) | topic + alias categories    | Positive direct-topic or linked-alias categorization; exact standalone alias          |
| News (`/news`)    | owner + topic + alias union | Feed ownership or positive direct/linked-alias categorization; exact standalone alias |
| Topics list       | linked topic                | Exact linked topic; standalone aliases have no topic result                           |
| RSS feeds list    | linked topic                | Feeds whose `rss_feeds.topic_id` matches; standalone aliases have no feed result      |

`/news?q=#slug` and `/topic/[slug]/news` must return overlapping result sets. The news `hashtag_topic_ids` union filter achieves this by combining both the feed-ownership check (same as `topic_ids`) and the category check (same as `/topic/[slug]/news`'s `category_topic_ids`).

## Community Labels

- Global and feed post list item payloads should include community sidecar data for posts that belong to a community.
- Post list items must show a community label when `post.community_id` is present and community data is available.
- Clicking the community label must navigate to the community posts page at `/communities/:slug`.
- Removing global feed community filters must not remove the ability to browse community-specific feeds from community pages.

## Responsive Behavior

- Feed and list filter rows must remain usable at small mobile widths without horizontal page scroll.
- Dropdown content should use natural width (`w-auto`, no wide fixed panels) unless a specific option set requires a wider panel.
- Text inside dropdown triggers, buttons, badges, and labels must not overflow its container.

## Coverage

- Changes to these surfaces must update or add Vitest coverage for shared components and server-rendered list page composition.
- Changes to these surfaces must update or add Playwright coverage for route-level behavior, including mobile responsiveness where layout changes affect filter rows.
- Changes to these surfaces must update Storybook stories for shared dropdown/search controls, representative post/news/feed list states, and each feed/post-type page top section.
- Documentation updates must keep this file, [Components](./COMPONENTS.md), [Routes](./ROUTES.md), [Mobile](./MOBILE.md), and [web/CLAUDE.md](../../../web/CLAUDE.md) in sync when behavior changes.
