# Markdown

## Parser

There are two types of parsers.

1. `loose` - essentially for content written by admins where we can trust all content
1. `strict` - essentially for content written by non-admins where we cannot trust all content

- No HTML allowed
- Add `rel="nofollow ugc" target="_blank"` to all external links

## Entity Mentions

Both parsers support special syntax for linking to entities:

- `@<username>` - Links to user profiles
  - Example: `@john_doe` → `<a href="/user/john_doe" class="md-link-user" title="John Doe">John Doe</a>`

- `#<topic-slug-or-alias>` - Links to topics
  - Example: `#bitcoin` → `<a href="/topics/cryptocurrency" class="md-link-topic" title="Bitcoin">Bitcoin</a>`

- `!<post-slug-or-id-or-canonical-url>` - Links to posts or comment permalinks
  - Example: `!my-review` → `<a href="/review/my-review" class="md-link-post" title="My Review">My Review</a>`
  - Example: `!https://voucha.ai/discussion/root-post/comment/<comment-id>` → internal comment permalink link

Entity mentions are resolved via database lookup. If an entity is invalid or not found, the text remains unchanged.

## Extractor

Extracts content from Markdown:

- Links - return all links
- Images - return all images

## URL Sanitization

- Link URLs only allow `http`, `https`, `mailto`, `tel`, or relative paths. Schemes like `javascript:`, `data:`, `vbscript:`, `file:`, `ws:`, and `wss:` are stripped.
- Image sources only allow `http`, `https`, or relative paths.
- Links to external `http/https` targets automatically get `rel="nofollow ugc noopener"` and `target="_blank"` in strict mode.
- Entity mention titles (display names, topic names, post titles) are properly HTML-escaped to prevent XSS.
- Mentions are only parsed at safe token boundaries; emails, mid-word strings, and off-site `!` URLs do not resolve.

## Related

- [Entity Links Service](../entity-links/README.md)
- [Content Rendering Overview](../../../docs/overview/architecture/content-rendering.md)
