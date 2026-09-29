# Entity Links Usage Examples

## Standalone Usage

```typescript
import { replaceEntityMentions } from '@services/entity-links'

// In plain text or HTML
const text = "Check out @john_doe's review of #bitcoin"
const withLinks = await replaceEntityMentions(text)
// Returns text with links to user and topic
```

## Integration with Markdown

The entity-links service is automatically integrated with the markdown renderer:

```typescript
import renderMarkdown from '@services/markdown'

const markdown = `
# My Review

Hey @alice, you should check out #chase-sapphire-reserve!

Read more in my full review: !my-detailed-review
`

const html = await renderMarkdown(markdown)
```

**Output:**

```html
<h1>My Review</h1>
<p>
  Hey
  <a
    href="/user/alice"
    class="md-link-user"
    title="Alice Smith"
    >Alice Smith</a
  >, you should check out
  <a
    href="/cards/chase-sapphire-reserve"
    class="md-link-topic"
    title="Chase Sapphire Reserve"
    >Chase Sapphire Reserve</a
  >!
</p>
<p>
  Read more in my full review:
  <a
    href="/reviews/my-detailed-review"
    class="md-link-post"
    title="My Detailed Review"
    >My Detailed Review</a
  >
</p>
```

## Security Considerations

### Safe in Strict Mode (User Content)

```typescript
// User-generated content (strict mode by default)
const userContent = 'Check out @admin and #topic'
const html = await renderMarkdown(userContent)
// Entity mentions are converted to links AFTER markdown escapes HTML
// This prevents XSS attacks
```

### Safe in Loose Mode (Admin Content)

```typescript
// Admin content (loose mode)
const adminContent = 'Announcement: @everyone check #new-feature!'
const html = await renderMarkdown(adminContent, { strict: false })
// HTML is allowed, but entity mention titles are still escaped
// to prevent XSS via user/topic/post names
```

## Code Block Protection

Entity mentions inside code blocks are NOT converted to links:

```typescript
const markdown = `
Here's how to mention users:

\`\`\`
Type @username to mention someone
\`\`\`

Inline code: \`@user\` is also not linked.
`

const html = await renderMarkdown(markdown)
// @username mentions inside code blocks remain as plain text
```

## Using with Post Titles

```typescript
import { replaceEntityMentions } from '@services/entity-links'

const postTitle = 'Discussion about @chase and #rewards'
const titleWithLinks = await replaceEntityMentions(postTitle)
// Titles can now include entity mentions too!
```

## Custom Query Options

```typescript
import renderMarkdown from '@services/markdown'

const html = await renderMarkdown(text, {
  strict: true,
  queryOptions: {
    // Pass custom query options to entity lookups
    // (e.g., transaction context, specific database connection)
  },
})
```
