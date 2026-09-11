# Community `list_type` Field

[Back to Communities API](README.md#community-list_type-field)

Communities have an optional `list_type: 'follow' | 'mute' | null` field that signals the community's primary curated list action:

- `follow` — the community's list is a follow list (Virtually Follow is the primary action)
- `mute` — the community's list is a mute list (Virtually Mute is the primary action)
- `null` — no list type designated (both actions are secondary)

Set via `POST /api/v1/communities` or `PATCH /api/v1/communities/:idOrSlug` body field `list_type`.
