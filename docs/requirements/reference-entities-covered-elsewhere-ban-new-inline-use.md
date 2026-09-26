# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## Covered elsewhere — ban new inline use

These entities have URL helpers, but they live **outside** `web/lib/links/entity-href.ts`.
Do not add new inline literals; import the helper instead.

| Entity          | URL shape                                                     | Canonical helper                                                                                                     | Source file                                             | Notes                                                                                                       |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| image placement | `/images/placements/[placementId]/[revision]/[imageId]?w=&q=` | `getPlacementImageUrl(placementId, revision, imageId, {width, quality?})`, `buildPlacementImagePath(image?, width?)` | `web/lib/utils/image-url.ts`, `web/lib/seo/metadata.ts` | Runtime image origin is encapsulated; uploaded draft previews use selected local bytes, not public delivery |

---
