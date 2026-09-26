# @services/sitemaps

Comprehensive sitemap generation service — builds XML sitemaps for posts by day and type plus dynamic non-post families, manages S3 storage, handles gzip compression, eligibility filtering, and backfill utilities.

## Key exports

- `generatePostDaySitemapFiles(day, postType)` — generates XML sitemaps for all eligible posts on a given UTC day
- `generatePostsIndex()` / `generateRootIndex()` — generates top-level sitemap index files
- `generateSitemapFamilyFiles(family)` — generates paginated dynamic family sitemaps for users, topics, communities, domains, and landing pages
- `putSitemapObjectFile(key, filePath)` — uploads an existing sitemap file to S3 and closes its read handle before returning, so callers can delete the file immediately
- `isPostPotentiallySitemapEligible(post)` — checks whether a post should appear in the sitemap
- `buildSitemapUrl(path)` / `buildPostUrl(post)` — constructs public sitemap URLs
- `getNightlyBackfillEntries()` / `getWeeklyBackfillEntries()` / `getMonthlyBackfillEntries()` — returns backfill schedule entries

## Public Routes And Storage Keys

- `/sitemap.xml` -> `sitemaps/root.xml`
- `/sitemaps/posts.xml` -> `sitemaps/posts.xml`
- `/sitemaps/static.xml` -> `sitemaps/static.xml`
- `/sitemaps/{post_type}.xml` -> `sitemaps/types/{post_type}.xml`
- `/sitemaps/{post_type}/YYYY-MM-DD/{page}.xml` -> `posts/YYYY/MM/DD/{post_type}/{page}.xml`
- `/sitemaps/{family}.xml` -> `sitemaps/families/{family}.xml`
- `/sitemaps/{family}/{page}.xml` -> `families/{family}/{page}.xml`

Supported post types come from `SITEMAP_CONFIG.POST_TYPES`; supported dynamic families come from `SITEMAP_CONFIG.FAMILY_TYPES`.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Sitemaps system: [../../queues/sitemaps/README.md](../../queues/sitemaps/README.md)
- AWS module (S3 storage): [../../modules/aws/README.md](../../modules/aws/README.md)
