# Comments

- Use [comment requirements](../../../docs/requirements/content/COMMENTS.md).
- Persist collapse state through `getPreference`/`setPreference` in `web/lib/preferences/storage.ts`, key `comments-collapsed:<rootPostId>[:<userId>]`; prune hydrated IDs against `mergedPostsMap`.
- Optimistic submits call `previewMarkdown()` into `extraMarkdownToHtml`, merged with `data.markdown_to_html` before node rendering. Preview failures fall back to raw markdown.
- Metadata-row clicks collapse threads; the chevron Button is the accessible `aria-expanded` control. Navigable UserLink/TimeAgo Link children stop propagation. Never make the row a button containing interactive descendants.
- Sort uses Select, never inline New/Best buttons; SelectTrigger keeps `h-11 sm:h-9` (44px mobile).
- Comment author UserLinks use `userTabForPostType('comment')` only when author exists and is neither deleted nor anonymous; otherwise render spans.
