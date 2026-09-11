# `list`

[Back to Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md#list)

| Action                                                      | Predicate | Description                                                                                     | Endpoint                                             | Component                                                                       |
| ----------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| <a name="list--copy-link"></a>Copy-Link                     | n/a       | Copies the list's canonical URL to the clipboard and shows a success toast. Owner-only UI.      | n/a (client)                                         | `web/app/(lists)/list/[id]/list-page-actions.tsx` → `copyLink()`                |
| <a name="list--import-community"></a>Import-Community       | n/a       | Opens a dialog to paste a community ID; bulk-copies the community's pinned items into the list. | `POST /api/v1/lists/:id/import`                      | `web/app/(lists)/list/[id]/list-page-actions.tsx` → `ListImportCommunityDialog` |
| <a name="list--add-item"></a>Add-to-List / Remove-from-List | n/a       | Checklist dialog showing the user's lists; toggling adds or removes the item.                   | `POST/DELETE /api/v1/lists/:id/items/{type}/:itemId` | `web/components/lists/add-to-list-menu-item.tsx`                                |
| Mark-Read / Mark-Unread                                     | n/a       | Records or removes a read timestamp for an `rss_feed_item` or `post` for the current user.      | `PUT/DELETE /api/v1/{type}/:id/read`                 | — (API only; no primary UI surface yet)                                         |
