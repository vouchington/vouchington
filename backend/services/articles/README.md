# @services/articles

Parses article Markdown with `gray-matter` frontmatter extraction from the assets S3 bucket, and syncs it as posts in the database. The committed [`articles/`](../../../articles/) directory is the source of truth; `.github/workflows/sync-articles.yml` packages its trusted-main Markdown into an immutable Actions artifact, while private infrastructure owns its S3/R2 publication boundary.

## Key exports

- `parseFrontmatter(content: string): ParsedArticle` — extracts frontmatter and body from a Markdown string via `gray-matter`
- `extractTitleFromMarkdown(body: string): string` — extracts the first H1 heading from Markdown as the title
- `listArticleMarkdownFiles(): Promise<ArticleMarkdownFile[]>` — lists `articles/*.md` objects from the assets bucket, excluding `README.md`
- `getArticleMarkdown(article): Promise<string>` — reads a bounded Markdown object from S3 with an in-process cache keyed by object metadata
- `syncArticles(currentUser): Promise<ArticleSyncResult>` — syncs all Markdown objects from S3 as posts, creating or updating as needed
- `syncLocalArticles(currentUser, articlesDir?): Promise<ArticleSyncResult>` — syncs the committed local `articles/` directory for local/test database seeding only

## Related

- Article source: [../../../articles/README.md](../../../articles/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
- Posts service: [../posts/README.md](../posts/README.md)
