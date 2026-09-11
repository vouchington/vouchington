# Sitemaps

[Back to Cloudflare Worker](README.md#sitemaps)

Caches sitemap responses from the sitemap CloudFront origin for `/sitemap.xml` and supported `/sitemaps/*` XML paths for a configurable time (1 day). Unsupported sitemap paths, including paths that contain URL-encoded dot, slash, or backslash octets, are rejected at the edge and are not fetched from the origin.

Supported sitemap route overrides:

- `/sitemap.xml` -> `/sitemaps/root.xml`
- `/sitemaps/posts.xml`, `/sitemaps/root.xml`, `/sitemaps/static.xml` -> same path
- `/sitemaps/{post_type}.xml` -> `/sitemaps/types/{post_type}.xml` for supported post types only
- `/sitemaps/{post_type}/YYYY-MM-DD/index.xml` -> `/posts/YYYY/MM/DD/{post_type}/index.xml`
  for valid calendar dates only
- `/sitemaps/{post_type}/YYYY-MM-DD/{page}.xml` -> `/posts/YYYY/MM/DD/{post_type}/{page}.xml`
  for valid calendar dates only
- `/sitemaps/{family}.xml` -> `/sitemaps/families/{family}.xml` for supported dynamic families only
- `/sitemaps/{family}/{page}.xml` -> `/families/{family}/{page}.xml`
