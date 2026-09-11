# Community Lists

[Back to Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md#community-lists)

| Entity           | Flow        | Authorization | Page/Route                             | Component (file:line)                                                                                   | Notes                                                                      |
| ---------------- | ----------- | ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `community_list` | Add item    | Community Mod | `/communities/[slug]/lists/[itemType]` | `web/components/communities/add-community-list-item-form.tsx`                                           | `itemType` ∈ `topics\|feeds\|posts\|domains\|urls`; types are schema-fixed |
| `community_list` | Remove item | Community Mod | Same page                              | `web/components/communities/community-list-items-list.tsx` (per-row remove) → `removeCommunityListItem` |                                                                            |
