# GET /api/v1/my/cards

[Back to My API](README.md#get-apiv1mycards)

Query parameters:

- `after` - opaque owner-scoped cursor from `page_info.end_cursor`
- `limit` - number of cards to return (1-100, default 25)

Cards are ordered by wallet-card UUID ascending. GET, POST, and PATCH use the same public card
shape: card-account fields plus `card: { id, name, slug }`. `credit_limit` is nullable
`{ amount, currency }` money; dates are nullable `YYYY-MM-DD` strings. The response does not expose
the owning individual or database timestamps.

`authorized_user_of_card` is a nullable, nonrecursive summary of the selected same-owner parent:
`{ id, opened_on, closed_on, card: { id, name, slug } }`. This keeps the parent label available
when that row is on a different cursor page.
