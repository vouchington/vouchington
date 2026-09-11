# Markdown Extraction

Extracts link and image URLs referenced in a markdown string, using `@jongleberry/vurst-markdown` to parse markdown syntax and linkify bare URLs.

## Usage

```typescript
import extract from '@modules/markdown-extraction'

const { link_urls, image_urls } = await extract(
  'Check out ![cover](https://example.com/cover.png) at https://example.com',
)
```

`extract(markdownText)` returns `{ link_urls: string[], image_urls: string[] }`:

- `link_urls` — URLs from markdown links (`[text](url)`) and auto-linkified bare URLs
- `image_urls` — URLs from markdown images (`![alt](url)`)

Non-string or empty input (including `null`/`undefined`) resolves to `{ link_urls: [], image_urls: [] }`. Unsupported URL schemes (e.g. `ws://`, `data:`) are ignored.
