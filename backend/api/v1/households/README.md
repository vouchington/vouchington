# Households API

Manage households and their memberships.

## Endpoints

| Method | Route                                              | Authentication             | Description                    |
| ------ | -------------------------------------------------- | -------------------------- | ------------------------------ |
| GET    | `/api/v1/households`                               | Required                   | List current user's households |
| POST   | `/api/v1/households`                               | Required                   | Create a household             |
| GET    | `/api/v1/households/:id`                           | Required (owner or member) | Get household detail           |
| PATCH  | `/api/v1/households/:id`                           | Required (owner)           | Update household               |
| DELETE | `/api/v1/households/:id`                           | Required (owner)           | Delete household               |
| GET    | `/api/v1/households/:id/memberships`               | Required (owner or member) | List household memberships     |
| POST   | `/api/v1/households/:id/memberships`               | Required (owner)           | Add a member to household      |
| DELETE | `/api/v1/households/:id/memberships/:membershipId` | Required (owner)           | Remove a member from household |

## POST /api/v1/households/:id/memberships

**Request:**

```json
{
  "individual_id": "<uuid>",
  "relationship": "spouse"
}
```

- `individual_id` (required) — UUID of the authenticated user's own individual to add.
  Cross-user membership additions require a future invitation/consent flow and are rejected for normal users.
- `relationship` (optional) — relationship type (e.g. "spouse", "child")

**Response:** `201 Created` with the membership object.

## Pagination

- `GET /api/v1/households` accepts `access=all|owned|member`, `after`, and `limit` (default 25,
  maximum 100). `all` is the default. `member` excludes households owned by the caller, including
  households where the owner's individual also has a membership row.
- `GET /api/v1/households/:id/memberships` accepts `after` and the same bounded `limit`.
- Both collections use opaque scoped cursors and order by `updated_at DESC, id DESC`. A cursor can
  only continue the same user/access or household query that produced it.
- Every successful page rechecks current authorization and returns accurate `page_info` based on a
  `limit + 1` query.
- Membership-page authorization and retrieval execute together on the primary database, so a
  committed membership revocation takes effect before any subsequent continuation statement.

## Authorization

- GET list/create: authenticated user only. The list returns owned and/or member-accessible
  households according to `access`.
- GET/PATCH/DELETE single: owner or member access
- Membership management: owner only. Owners may add their own individual record; adding another
  user's individual is not allowed without an invitation/consent flow.

## Performance

| Endpoint                                                | Round Trips | Caching | Notes                                   |
| ------------------------------------------------------- | ----------- | ------- | --------------------------------------- |
| GET /api/v1/households                                  | 2           | None    | Auth + owner/member candidate query     |
| POST /api/v1/households                                 | 2           | None    | Auth + create                           |
| GET /api/v1/households/:id                              | 2           | None    | Auth + get                              |
| PATCH /api/v1/households/:id                            | 2           | None    | Auth + update                           |
| DELETE /api/v1/households/:id                           | 2           | None    | Auth + delete                           |
| GET /api/v1/households/:id/memberships                  | 2           | None    | Auth + primary authorization/page query |
| POST /api/v1/households/:id/memberships                 | 2           | None    | Auth + create                           |
| DELETE /api/v1/households/:id/memberships/:membershipId | 2           | None    | Auth + delete                           |

## Related

- Service: [../../services/individuals-households/](../../../services/individuals-households/README.md)
- Individuals: [../individuals/README.md](../individuals/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
