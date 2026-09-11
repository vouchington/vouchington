# Community Lists reference

[Back to Community Lists](community-lists.md)

## List Type

A community can designate its curated list as either a follow list or mute list via the `list_type` field:

| Value    | Meaning                                  |
| -------- | ---------------------------------------- |
| `follow` | The canonical action is Virtually Follow |
| `mute`   | The canonical action is Virtually Mute   |
| `null`   | No canonical list action is shown        |

The `list_type` determines which single list action appears in the community header. Setting `list_type` on a community also makes it discoverable on the "Explore Lists" page (`/communities/lists`).

## Explore Lists Page (`/communities/lists`)

A dedicated discovery page shows communities with curated lists:

- Only communities with `list_type` set **and** at least one list item appear here
- Sorted by `virtual_subscriptions` (proxy follow + proxy mute count) by default
- Filterable by list type: All, Follow Lists, Mute Lists
- Also searchable by query string
