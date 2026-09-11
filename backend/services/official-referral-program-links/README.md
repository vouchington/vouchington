# official-referral-program-links

Admin-only service for platform-level official Voucha referral links, distinct
from per-user personal endorsements (`user-referral-program-links`).

## Data model

Official links are rows in `user_referral_program_links` owned by the `@voucha`
system account. Two audit columns distinguish them:

- `created_by_id` — the admin who published the link
- `deleted_by_id` — the admin who soft-deleted it

URLs are **immutable**: create and delete only. To update a URL, delete the
existing row and create a new one.

## Authorization

All mutations require the `administrator` role (`currentUserCanManageOfficialReferralLink`).
The personal `isOfficialAccount` block in `user-referral-program-links/create.mts`
is deliberately bypassed here — this is the sanctioned official path.

## Display

Official links surface as `priority_group = 0` in `getPrioritizedReferralLinks`
and are always included regardless of the personal link limit. The frontend
renders them in a dedicated "Use our official links" section with an
`official-voucha-badge`.
