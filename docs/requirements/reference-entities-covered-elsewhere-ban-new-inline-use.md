# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## Covered elsewhere — ban new inline use

These entities have URL helpers, but they live **outside** `web/lib/links/entity-href.ts`.
Do not add new inline literals; import the helper instead.

| Entity | URL shape            | Canonical helper                                                    | Source file                                             | Notes                                                                                                                |
| ------ | -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| image  | `/images/[id]?w=&q=` | `getImageUrl(id, {width, quality?})`, `buildImagePath(id?, width?)` | `web/lib/utils/image-url.ts`, `web/lib/seo/metadata.ts` | Host-overloaded at runtime (relative / prod CDN / staging CDN); the literal is fully encapsulated in these two files |

---
