# Community `member_roster_visibility` Field

[Back to Communities API](README.md#community-member_roster_visibility-field)

`member_roster_visibility` controls which viewers can see regular member rows in
`GET /api/v1/communities/:idOrSlug/members`:

- `public` — anyone who can view the community
- `users` — signed-in users
- `members` — active members of the community
- `moderators` — owners, moderators, and site administrators

Owners and moderators are always returned to viewers who can view the community. Regular member rows
also respect each user's `community_memberships_visibility`. Community owners/moderators and site
administrators bypass both roster filters for moderation.

Set via `POST /api/v1/communities` or `PATCH /api/v1/communities/:idOrSlug` body field
`member_roster_visibility`.
