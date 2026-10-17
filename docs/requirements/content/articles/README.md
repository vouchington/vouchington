# Articles

Source entrypoint: [articles/README.md](../../../../articles/README.md)

Seed articles for blog publishing and public/site knowledge retrieval. The directory is the committed
source of truth for article Markdown; frontmatter fields and the sync pipeline are read from
`backend/scripts/seed/articles.mts` and [`@services/articles`](../../../overview/architecture/services/articles/README.md).

## Linking Between Articles

Link to another article with a relative file link, `text` (a `#fragment` is fine). The path is the target's file name, which is its slug. The link works when the files are browsed on GitHub.

Sync rewrites each such link to `/article/other-slug` before it stores the Markdown, so rendered HTML, the API, MCP, RSS, and the `/md/posts/...` Markdown alias all link to the article page. Without the rewrite, `./other-slug.md` resolves on `/article/<slug>` to `/article/other-slug.md`, which the Cloudflare Worker serves as the raw-Markdown alias instead of the page. Links inside code spans and code blocks are left as written. Native clients render the API's HTML, so they receive the same root-relative `/article/...` href as the web.

## Seeding

Publication is owned by the private infrastructure receiver, which selects and validates the
packaged artifact. The next sync converges an article to the repository version.
