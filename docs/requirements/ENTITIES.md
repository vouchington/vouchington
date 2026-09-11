# URL-Routable Entity Catalog

Single source of truth for which entities have canonical routes and which
`web/lib/links/` helper(s) to use when building their URLs.

**Purpose:** prevents hand-built template literals like `` `/user/${id}` `` from
proliferating in JSX. Every routable entity listed here either has a helper (use it)
or is explicitly tracked as a gap (add the helper before adding the URL). An ast-grep
ban rule (`web-no-inline-entity-href` in ast-grep) enforces detail entity helpers at
lint time.

## Contents

- <a id="how-to-use-this-catalog-topic-family-and-related-references"></a>[How to use this catalog, topic family, and related references](reference-entities-how-to-use-this-catalog.md)
- <a id="post-family"></a>[Post family](reference-entities-post-family.md)
- <a id="podcast-hub"></a>[Podcast hub](reference-entities-podcast-hub.md)
- <a id="entities-with-helpers-and-gaps"></a>[Entities with helpers and gaps](reference-entities-with-helpers.md)
- <a id="covered-elsewhere--ban-new-inline-use"></a>[Covered elsewhere — ban new inline use](reference-entities-covered-elsewhere-ban-new-inline-use.md)
- <a id="excluded--not-entity-urls"></a>[Excluded — not entity URLs](reference-entities-excluded-not-entity-urls.md)
