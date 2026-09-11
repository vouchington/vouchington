# @modules/wikipedia-api

Compatibility facade over `@vouchington/wikimedia`. It preserves Voucha's snake_case result
shapes while the upstream client owns three-slot physical concurrency, bounded retries, and the
10-second per-attempt timeout. Requests use the shared guarded external Undici dispatcher; there is
no local courtesy delay between calls.

## Exports

### `searchWikipediaByTitle(query: string, limit?: number): Promise<WikipediaSearchResult[]>`

Searches the Wikimedia Core API by title and returns matching results.

### `getWikipediaSummary(title: string): Promise<WikipediaSummary | null>`

Fetches a page summary from the Wikimedia REST v1 API. Returns `null` if the page is not found.

### Types

- `WikipediaSummary` — `{ pageid, title, url, extract, description, thumbnail_url }`
- `WikipediaSearchResult` — `{ title, pageid }`

## Related

- Parent: [../README.md](../README.md)
- Wikipedia recommender system: [../../queues/wikipedia-recommender/README.md](../../queues/wikipedia-recommender/README.md)
- Wikipedia recommender service: [../../services/wikipedia-topic-recommendations/README.md](../../services/wikipedia-topic-recommendations/README.md)
