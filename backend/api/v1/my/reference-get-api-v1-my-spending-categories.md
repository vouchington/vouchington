# GET /api/v1/my/spending-categories

[Back to My API](README.md#get-apiv1myspending-categories)

Query parameters:

- `after` - opaque account-scoped cursor from `page_info.end_cursor`
- `limit` - number of entries to return (1-100, default 25)

Entries are ordered by UUID ascending and responses use `{ results, page_info }`. Each entry
contains only its public management fields plus `spending_category: { id, name, slug }`.
`owner_type` identifies individual or household ownership. `can_manage` is false for a household
member's read-only entry; owner and administrator entries remain manageable. Owner UUIDs and
database timestamps are not returned.
