# Entity Links

Service for parsing and resolving entity mentions in text and converting them to HTML links.

## Features

Converts special syntax to links:

- `@<username>` → Link to `/user/<username>` with display name as title and link text
  - Class: `md-link-user`
  - Example: `@john_doe` → `<a href="/user/john_doe" class="md-link-user" title="John Doe">John Doe</a>`

- `#<topic-slug-or-alias>` → Link to `/<topic-type>/<slug>` with topic name as title and link text
  - Class: `md-link-topic`
  - Example: `#bitcoin` → `<a href="/topics/cryptocurrency" class="md-link-topic" title="Bitcoin">Bitcoin</a>`

- `!<post-slug-or-id-or-canonical-url>` → Link to a post detail page or comment permalink
  - Class: `md-link-post`
  - Example: `!my-review` → `<a href="/review/my-review" class="md-link-post" title="My Amazing Review">My Amazing Review</a>`
  - Example: `!/discussion/root-post/comment/<comment-id>` → `<a href="/discussion/root-post/comment/<comment-id>" ...>!/discussion/root-post/comment/<comment-id></a>`

## Usage

### Simple replacement

```typescript
import { replaceEntityMentions } from '@services/entity-links'

const text = "Check out @john_doe's review of #bitcoin at !my-review"
const html = await replaceEntityMentions(text)
// Returns HTML with entity mentions converted to links
```

### Advanced: Parse and resolve separately

```typescript
import {
  parseEntityMentions,
  resolveEntityMentions,
  formatMentionAsHtml,
} from '@services/entity-links'

// 1. Parse text to find mentions
const mentions = parseEntityMentions(text)
// Returns: [{ type: 'user', raw: '@john_doe', identifier: 'john_doe', startIndex: 10, endIndex: 19 }, ...]

// 2. Resolve mentions (database lookup)
const resolved = await resolveEntityMentions(mentions)
// Returns: [{ type: 'user', raw: '@john_doe', username: 'john_doe', displayName: 'John Doe', url: '/user/john_doe' }, ...]

// 3. Format as HTML
const html = resolved.map(formatMentionAsHtml).join('')
```

## Entity Resolution

- **Users**: Looks up by username (case-insensitive)
  - Uses cached lookup via `getUserPublicByAnyCached`
  - Display name from meta account or username

- **Topics**: Looks up by slug or alias (case-insensitive)
  - First tries direct slug match via `getTopicByAnyCached`
  - Falls back to alias search via `getTopicByAlias`
  - URL format: `/<topic-type>/<slug>` (e.g., `/topics/crypto`, `/cards/amex-gold`)

- **Posts**: Looks up by slug
  - Uses cached lookup via `getPostByAnyCached`
  - Accepts slugs, UUIDs, and same-site canonical post/comment URLs
  - URL format: canonical singular post detail routes (e.g., `/discussion/my-post`, `/review/my-review`) or comment permalinks

## Unresolved Mentions

If an entity is invalid or not found, the original text is returned unchanged:

- `@nonexistent_user` → `@nonexistent_user` (no link)
- `#unknown-topic` → `#unknown-topic` (no link)
- `!missing-post` → `!missing-post` (no link)

## Pattern Matching

- Case-insensitive lookups for usernames and topic slugs/aliases
- Only parses at safe token boundaries
- Rejects emails, mid-word fragments, and off-site `!` URLs

## Related

- [Markdown Service](../markdown/README.md)
- [Content Rendering Overview](../../../docs/overview/architecture/content-rendering.md)
