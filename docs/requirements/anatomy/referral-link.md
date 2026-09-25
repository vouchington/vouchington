# Referral Link Anatomy

> A user-submitted affiliate or referral URL for a referral program topic, displayed to other users
> in a priority order based on their social relationship with the link owner.

## See Also

- [Entity × Action Matrix — referral_link](../ENTITY-ACTION-MATRIX.md)
- [Referral Links requirements](../users/REFERRAL-LINKS.md)

## Data Model

| Field                                        | Notes                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                                         | UUID                                                                                                    |
| `user_id`                                    | Owner of the referral link                                                                              |
| `referral_program_id`                        | FK to the referral program topic                                                                        |
| `url`                                        | The referral/affiliate URL                                                                              |
| `label`                                      | Optional display label set by the owner                                                                 |
| `activated_at`                               | Non-null when link is active                                                                            |
| `deactivated_at`                             | Non-null when link has been deactivated                                                                 |
| `review_post_id`                             | FK to the owner's best review for this program's topics (nullable)                                      |
| `review_avg_rating`                          | Star rating of the linked review (nullable)                                                             |
| `parent_link_id`                             | FK to the parent referral link when this is an Amex-unfurled per-card child (nullable)                  |
| `unfurl_requested_at`                        | Non-null once the owner has requested an Amex unfurl (parent only)                                      |
| `unfurl_completed_at`                        | Non-null when the most recent unfurl finished successfully (parent only)                                |
| `unfurl_failed_at`                           | Non-null when the most recent unfurl failed, or resolved zero children (parent only)                    |
| `unfurl_last_error`                          | Truncated (≤1000 chars) error message from the last failed unfurl (parent only)                         |
| `created_via`, `created_via_oauth_client_id` | Immutable creation channel and OAuth client; see [Content provenance](../content/content-provenance.md) |

**Priority groups** (each owner appears in exactly one group — their highest priority match):

| Group | Description                                             | Auth required |
| ----- | ------------------------------------------------------- | ------------- |
| 1     | Mutual follows                                          | Yes           |
| 2     | One-way follows (you follow them)                       | Yes           |
| 3     | Sign-up referrers                                       | Yes           |
| 4     | Authors whose posts received your positive trust choice | Yes           |
| 5     | Everyone else                                           | No            |

Signed-out viewers see group 5 only. Signed-in viewers see all 5 groups.

## States

| State       | Condition                                             | Behavior                           |
| ----------- | ----------------------------------------------------- | ---------------------------------- |
| Active      | `activated_at IS NOT NULL AND deactivated_at IS NULL` | Eligible to appear in public views |
| Deactivated | `deactivated_at IS NOT NULL`                          | Hidden from prioritized query      |

Links can be manually reactivated by the owner. Broken links are auto-deactivated after health
checks (404/410 immediately; 5xx/timeout after 3 consecutive failures).

**Child links (Amex unfurl).** A child (`parent_link_id IS NOT NULL`) is immutable via the normal
Edit/Activate/Deactivate/Delete actions — those requests 403 with `Child referral links are managed
via their parent`. Children are instead created, refreshed, and pruned by re-running Unfurl on the
parent, and are soft-deleted when the parent is soft-deleted. A child is additionally hidden from
every public surface (and from the owner's own management list) whenever the owner does not
currently hold an active Plus/Pro membership — checked at query time so a time-based membership
expiry hides children immediately even though no event fires; a downgrade also eagerly soft-deletes
the owner's children as cleanup. The parent link itself is a normal, ungated, manually-added link
and is never affected by the owner's membership tier.

## Surfaces

| Surface                  | Route pattern                    |
| ------------------------ | -------------------------------- |
| Topic referral-links tab | `/:topicType/:id/referral-links` |
| Topic detail aside       | Alongside the topic detail page  |
| Personal feed            | `/feed/referral-links`           |
| My management page       | `/my/referral-links`             |

## List-Item / Card Anatomy

**Topic tab and aside card:**

| Element        | Shows                                                | Visible when                      |
| -------------- | ---------------------------------------------------- | --------------------------------- |
| Owner username | Linked to owner's profile                            | Always                            |
| Link URL       | The referral/affiliate URL                           | Always                            |
| Open button    | Opens the referral URL                               | Always                            |
| Review rating  | "★ {avg}/5 review" linked to the owner's review post | When `review_post_id` is non-null |

Cards on the tab view are organized by priority group with section headers.

**Personal feed card** (different data shape from the topic tab card):

| Element               | Shows                            | Visible when |
| --------------------- | -------------------------------- | ------------ |
| Poster avatar         | Owner's profile image            | Always       |
| Poster username       | Linked to owner's profile        | Always       |
| Referral program name | Linked to the program topic page | Always       |
| Link URL              | The referral/affiliate URL       | Always       |
| Open button           | Opens the referral URL           | Always       |

## Detail Anatomy

**Tab view** (`/:topicType/:id/referral-links`):

- Organized by priority group with labeled section headers
- Add/edit form for the current viewer's own referral link (authenticated)
- "Show All" button reveals all links as a flat list including the viewer's own link

**Topic detail aside**:

- Shows the top ~5 links from the highest priority groups
- Not shown on the referral-links tab itself
- Includes a CTA linking to the full tab

## Actions

| Action               | Who can act                                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| Add link             | Signed-in users                                                             |
| Edit label           | Link owner                                                                  |
| Activate             | Link owner                                                                  |
| Deactivate           | Link owner                                                                  |
| Delete               | Link owner                                                                  |
| Unfurl (Plus/Pro)    | Link owner with an active Plus/Pro membership; not available on child links |
| Show All (flat view) | Authenticated viewers (`?all=true`)                                         |
| View click log       | Link owner (`/my/referrals`)                                                |

## Related

- [topic](./topic.md) — referral-program topics that host these links
- [post](./post.md) — review posts coupled with referral links via `review_post_id`
