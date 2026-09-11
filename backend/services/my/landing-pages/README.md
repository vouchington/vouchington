# Landing Pages

User-customizable landing pages that aggregate reviews, referral links, and profile links.

## Overview

Landing pages let users build curated profile pages showcasing their content. Each page is composed of ordered items — profile links, reviews (with topic ratings), referral links, and topic groups that cluster related items. Users can have multiple landing pages with one designated as the default, accessible at `/@username`.

## Key Files

- `candidates.mts` — `getMyLandingPageCandidates()` fetches eligible content for the page builder: owned public reviews, active referral links, and profile links
- `create.mts` — Creates a landing page with title, subtitle, slug; enforces max page limit via advisory lock; first page auto-becomes default
- `update.mts` — Updates title, subtitle, slug
- `delete.mts` — Deletes a landing page
- `list.mts` — Lists all landing pages for a user
- `get.mts` — Gets a landing page with resolved items
- `set-default.mts` — Sets a landing page as the user's default
- `replace-items.mts` — Atomically replaces all items on a landing page (transactional delete + insert)
- `resolve-items.mts` — Resolves item references (profile_link_id, review_id, referral_link_id, topic_id) into full objects with data
- `public.mts` — `getPublicLandingPage()` for public-facing page rendering (resolves user, markdown, items)
- `shared.mts` — Validation helpers (title, subtitle, slug) and shared query utilities
- `types.mts` — Type definitions for landing pages, items, candidates, topic groups

## Item Types

| Type            | Description                                             |
| --------------- | ------------------------------------------------------- |
| `profile_link`  | External link from the user's profile                   |
| `review`        | A review post with topic ratings                        |
| `referral_link` | An active referral program link                         |
| `topic_group`   | Groups reviews and referral links under a topic heading |

## Architecture Notes

- Landing page creation uses `pg_advisory_xact_lock` to prevent race conditions on the max page count check
- Item replacement is fully transactional: all existing items are deleted and new items inserted in one transaction
- Topic groups contain nested entries (reviews and/or referral links) that are stored as separate rows with a parent topic reference
- Public pages resolve the user's display name and markdown bio alongside the page content
- Slug validation and uniqueness is enforced per-user

## Related

- Profile links: [`backend/services/my/profile-links.mts`](../profile-links.mts)
- Referral links: [`backend/services/prioritized-referral-links/`](../../prioritized-referral-links/)
- Reviews: [`backend/services/posts/`](../../posts/) (post_type = 'review')
