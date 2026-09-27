# Comments Components

Comment tree UI. Full spec: [docs/requirements/content/COMMENTS.md](../../../docs/requirements/content/COMMENTS.md).

## Rules

- Collapse state persists in `localStorage` via `getPreference`/`setPreference` from `web/lib/preferences/storage.ts`. Key: `comments-collapsed:<rootPostId>[:<userId>]`. Prune IDs on hydrate against current `mergedPostsMap`.
- Optimistic new comments: call `previewMarkdown()` on submit to populate `extraMarkdownToHtml`; merge with `data.markdown_to_html` before rendering nodes. Swallow `previewMarkdown` errors — fallback renders raw markdown.
- Metadata row (chevron + avatar + username + timestamp) collapses thread on click. The `<Button>` chevron is the primary accessible control (`aria-expanded`). All navigable children (`<UserLink>`, `<Link>` wrapping `<TimeAgo>`) call `e.stopPropagation()`. Do not convert the row to a `<button>` — interactive descendants inside a button violates ARIA.
- Sort uses a `Select` dropdown, not inline `New`/`Best` buttons. Keep `SelectTrigger` at a 44px mobile touch target (`h-11 sm:h-9`).
- `<UserLink user={post.created_by} tab={userTabForPostType('comment')}>` — render as link only when `!isDeleted && !isAnonymous && post.created_by`. Anonymous/deleted authors render as `<span>`.
