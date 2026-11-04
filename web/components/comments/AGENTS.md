# Comments

- Use comment requirements.
- Signed-in collapse is the server `hide` bookmark (`useCommentCollapse`): optimistic toggle through `bookmarkEntity`/`unbookmarkEntity`, initial state from `data.bookmarks`. It never touches localStorage. Opening a hidden comment whose replies are not loaded fetches `fetchPostDescendants(id)` and merges them, with a Load more button while `has_next_page`.
- Signed-out collapse uses `getPreference`/`setPreference` in `web/lib/preferences/storage.ts`, key `comments-collapsed:<rootPostId>` only; prune hydrated IDs against `mergedPostsMap`.
- A comment with `placeholder_state` (`deleted` or `unmoderated`) has no text or author: render the label, no author link, no actions. The collapsed header reply count is `posts_metrics.count.children`, falling back to the loaded children.
- `hide` on a comment is not a list filter: `PostList` keeps comments the viewer hid.
- Optimistic submits call `previewMarkdown()` into `extraMarkdownToHtml`, merged with `data.markdown_to_html` before node rendering. Preview failures fall back to raw markdown.
- Metadata-row clicks collapse threads; the chevron Button is the accessible `aria-expanded` control. Navigable UserLink/TimeAgo Link children stop propagation. Never make the row a button containing interactive descendants.
- Sort uses Select, never inline New/Best buttons; SelectTrigger keeps `h-11 sm:h-9` (44px mobile).
- Comment author UserLinks use `userTabForPostType('comment')` only when author exists and is neither deleted nor anonymous; otherwise render spans.
