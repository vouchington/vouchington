Review SEO and indexing behavior. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [SEO](../../../docs/requirements/seo/SEO.md) and [Sitemaps](../../../docs/overview/architecture/sitemaps.md) against canonical URLs, robots/indexability rules, metadata, structured data, public/private visibility, sitemap eligibility, and dynamic rendering.
- Keep behavior aligned across web routes, sitemap generation, and Cloudflare Worker routing.
- Prefer fixes that prevent incorrect indexing or improve machine-readable page metadata.
- Add or tighten targeted tests for the selected SEO behavior.
