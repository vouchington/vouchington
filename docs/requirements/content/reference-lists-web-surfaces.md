# Lists reference

[Back to Lists](LISTS.md)

## Web Surfaces

| Surface                 | Route / Component                                        | Notes                                                               |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Owner index             | `/my/lists` — `web/app/(my)/my/lists/page.tsx`           | Lists the user's own lists; Create CTA                              |
| List detail             | `/list/[id]` — `web/app/(lists)/list/[id]/page.tsx`      | All/Reading/Watch/Listen tabs; `ListItemRow`; Load-more cursor      |
| List actions bar        | `web/app/(lists)/list/[id]/list-page-actions.tsx`        | Copy-link + Import from community (owner only)                      |
| Dynamic sidebar group   | `web/components/lists/lists-sidebar-group.tsx`           | `useEffect` fetch of `searchMyLists`; `lists:created` event prepend |
| Add-to-List menu item   | `web/components/lists/add-to-list-menu-item.tsx`         | Dialog with checklist of user's lists; toggles add/remove           |
| Import community dialog | `web/components/lists/list-import-community-dialog.tsx`  | Accepts community ID; calls `POST /api/v1/lists/:id/import`         |
| Canonical list-item row | `web/components/lists/list-item-row.tsx` (`ListItemRow`) | Canonical component for `list_item` in the registry                 |
| Static nav intent       | `web/lib/navigation/intents/lists.ts` (`LISTS_INTENT`)   | Sidebar + Cmd+K entry for `/my/lists`                               |
