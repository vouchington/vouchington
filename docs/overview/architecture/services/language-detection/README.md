# language-detection service

Source entrypoint: [backend/services/language-detection/README.md](../../../../../backend/services/language-detection/README.md)

Detects the natural language of text content for six entity types and
persists raw detection results to the database.

## Usage

Each entity module in `entities/` exposes a single `detect*Language(id)` function:

```ts
import { detectPostLanguage } from '@services/language-detection/entities/posts'
await detectPostLanguage(postId)
```

The service skips detection when `lingua_rs_input_sha256` matches a key derived
from text + normalized declared language (idempotent — changing either re-triggers
detection safely).

## Detection sources (priority order)

1. **Declared language** — user-supplied (`posts.declared_language`, `communities.default_language`, `rss_feeds.declared_language`, `crawls.lang`) — no N-API call
2. **lingua-rs** — all 75 languages via the `lingua-rs` npm package (dynamic import with graceful fallback when unavailable)

The package downloads its native binding in a postinstall script. Backend image builds set
`LINGUA_RS_STRICT_INSTALL=1` in `backend/Dockerfile`, so a failed download fails the build instead
of shipping an image without the binding; local installs stay best-effort.

## Raw result schema (JSONB `lingua_rs_results`)

Results differ by source. For `source: 'lingua'` (full detection):

```json
{
  "source": "lingua",
  "detector": "lingua",
  "detectorModelVersion": "1.8.0",
  "languages": [{ "iso6391": "en", "iso6393": "eng", "confidence": 0.98 }]
}
```

For `source: 'declared'` (authoritative language already known):

```json
{ "source": "declared", "language": "en" }
```

For `source: 'none'` (empty text):

```json
{ "source": "none" }
```
