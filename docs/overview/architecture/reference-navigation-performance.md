# Navigation Performance

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#navigation-performance)

Anonymous web documents render conservative Speculation Rules that prefetch safe same-origin
document navigations only. The rules exclude query-string URLs, API/infra/markdown/RSS routes,
authenticated or mutating areas such as `/my`, `/chat`, `/support`, `/crm`, admin, login/logout,
create/edit/settings/review-queue paths, and links with `target`, `download`, `rel=nofollow`, or
`data-no-speculation`. The root layout also emits React resource hints for configured cross-origin
static asset and image origins.
