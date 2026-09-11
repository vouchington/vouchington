# Tags (aka Entity Relations)

## Tag Pages

Tags can be added for posts, topics, RSS feed items, and users.
Tag pages are only available to logged-in users.

### Routes

- `/:topic-type/:idOrSlug/tags/:object-type`, e.g. `/card/american-express-platinum-card/tags/topic`
- `/:post-type/:idOrSlug/tags/:object-type`, e.g. `/article/best-cards/tags/topic`
- `/:topic-type/:idOrgSlug/latest/:guid/tags/:object-type`, e.g. `/topic/openai/latest/1234/tags/topic`

By default, going to /tags goes to /tags/topic.

Valid `:object-type` values per entity:

| Entity   | Manage Tags dropdown items                                                        |
| -------- | --------------------------------------------------------------------------------- |
| Post     | `topic`, `post`, `url`                                                            |
| Topic    | `topic`, `category`, `post`, `landing_page`, `terms_of_service`                   |
| Source   | `topic`, `category`, `publisher_type`, `post`, `landing_page`, `terms_of_service` |
| RSS item | `topic`                                                                           |

User tags are managed from the profile aside rather than a full tag page. They use the
election-backed `user → category → topic` relation and a closed catalog containing `Bot` and
`Spammer`. The profile aside shows net-positive tags with voting controls. The Manage modal shows
all allowed tags and contested relations. User-tag votes do not mute, unfollow, or notify.

### Publisher Type Enum Constraint

The `publisher_type` tag type is available only on Source topics (`topic_type === 'rss_feed'`) and
is a **closed enum** — only the 8 known publisher types (defined in
`ts-shared/utils/publisher-types.mts`) may be used as the object. Direct
`publisher_type` tag URLs for non-source topics return notFound. The enum values are seeded topics
with slugs: `mainstream-media`, `public-media`, `corporate-media`, `blog`, `aggregator`, `forum`,
`ugc-platform`, `review`.

This constraint is enforced both client-side (a fixed `Select` dropdown replaces the free-form
autocomplete) and server-side (`assertPublisherTypeObjectsAreValid` in
`backend/services/entity-relations/upsert.mts` rejects unknown IDs with HTTP 422).

The available publisher types (with resolved IDs) are served by a public endpoint:
`GET /api/v1/topics/publisher-types` → `{ publisher_types: [{ id, slug, label }] }`.

### Manage Tags Entry Point

Post detail pages show a **Manage Tags** dropdown in the post detail Menubar. The dropdown is only visible to authenticated users (unauthenticated users see only Comments). Selecting a relation navigates to the matching `/:post-type/:id/tags/:object-type` route. Unauthenticated users who navigate directly to a tags URL are redirected to `/login`.

Native parity note: RSS item category management is dialog-first on the native clients and reuses the shared manage-tags content wrapper from the item menubar. Post, topic, and source tag flows stay on their detail routes, and source `publisher_type` remains the closed enum defined by the publisher-type topics endpoint.

Web parity note: authenticated tag asides now open the shared manage-tags dialog instead of linking straight to the full page. The dialog includes a "Manage all tags" link only when the current entity has a real tags route; RSS item category management still stays dialog-only because it has no full-page route.

### Adding Tags

On each page, you can select the following tag to add:

- Relation Type
- Entity (based on the page) using an autocomplete component

### Viewing Tags

On each page, show all entities grouped by relation sorted by the election sort score, regardless of the net vote score.
Each entity tag uses Confirm or Dispute for voting on the relation.

## Manual Tag-Add Limit

Manually **adding** a new tag relation is capped by a standing per-(subject, relation) count, separate from the [contribution rate limits](../trust-safety/CONTRIBUTION-LIMITS.md) (which throttle creation _rate_, not a standing total). The cap only gates new adds — voting on an existing relation is never limited, since votes write to the relation's separate `__votes` table rather than a new row in `relation.table_name`.

| Tier          | Tag-Add Limit (per subject, per relation) |
| ------------- | ----------------------------------------- |
| `just_joined` | 3                                         |
| `free`        | 3                                         |
| `plus`        | 7                                         |
| `pro`         | 15                                        |
| `admin`       | unlimited                                 |

The count only includes relations the current user originated (`created_by_id`), scoped to one subject and one relation's table (e.g. a post's `topic` relations and a post's `url` relations have independent budgets). Values are runtime-configurable through DynamicConfig namespace `manual-tag-limits`, enforced by `assertWithinTagAddLimit` (`backend/services/tag-limits/assert.mts`). Exceeding the limit throws HTTP 403 with error code `TAG_LIMIT_REACHED` — a standing-cap rejection, not a rate-limited retry-later (429).

**`data_point` topics share this budget.** A data point post's `structured_data.topic_ids` are written through the same `post → category → topic` relation (`relation__post__category__topic`) used by manual topic tagging, so data-point topic selections and manually-added topic tags draw from the same per-post cap.

**Client parity deviation:** no `TAG_LIMIT_REACHED` case exists in `backend/test-helpers/api-fixtures/`. Clients branch on the raw error code via their own predicate helpers (`isTagLimitError` in `web/lib/api/error-helpers.ts`, `VouchaError.tagLimitReached` in Swift, `VouchaApiException.IsTagLimitReached` in .NET) instead of an api-fixtures case, tested at the component/view-model mock level. This follows the existing `EMAIL_VERIFICATION_REQUIRED` precedent, which is also not modeled as an api-fixtures case.

This is separate from the [autotagger's per-tier topic cap](../users/reference-memberships-feature-limits.md#autotagger), which limits how many topics the LLM agent adds automatically and is unrelated to this manual-add limit.

## Tag Asides

A Tag Aside shows entity relations for the current entity for a specific relation. Most asides
show all positive relations through their normal list behavior. Post Related Links and its Hacker
News lookup are intentionally a single summary page: at most the dynamically configured 10
best-ranked positive `post → related → url` relations. The shared Manage dialog and full tag page
use the ordinary cursor endpoint and can traverse all relations, including zero and negative scores.
All entity relations will be sorted by election sort score.
Relations with a net vote score **strictly > 0** are shown for **everyone** (authenticated and anonymous alike). Relations with net ≤ 0 (freshly-added or contested) are not visible in the aside; they are visible and votable only on the manage-tags page, which lists all relations regardless of score. Vote scores are weighted floats (new-account weight = 0.01), so `> 0` is meaningfully different from `≥ 1`: a relation with a single new-account Confirm has net ≈ 0.01 and **does** appear in the aside. This supersedes the prior auth-aware rule and reverts the `isAuthenticated ? 0 : 1` threshold from PR #6378. If there are no relations to show, do not show the aside.

For logged-in users, these asides will be streamed and will show Confirm and Dispute controls. For logged-out users, these asides will be rendered synchronously as part of the page load.

For logged-in users, show a "manage tags" button that links to the relevant Tag Page above (e.g. if the object type is `topic`, go to /tags/topics`)

This is one shared, configurable component.

### List of Tag Asides

- Topics (all types):
  - Categories (predicate `category`; general topic taxonomy — available for all topic types, seeded for podcast shows from Apple `<itunes:category>` data)
  - Related Topics
  - "FAQs" - FAQ Posts
  - Landing Page (URL, all topic types)
  - Terms of Service (URL, all topic types)
- Sources:
  - Publisher Type (source-only, closed enum)
- Posts:
  - Related Topics
  - Related Posts
  - Related Links (summary aside; all relations remain available through Manage)
- RSS Feed Items
  - Related Topics

## Shared manage-tags wrapper

Both manage-tags surfaces — the full page (`ManageTagsTabs`) and the shared client dialog wrapper
(`web/components/tags/manage-tags-dialog.tsx`) used by `ManageCategoriesMenuItem` and the
authenticated aside "Manage" buttons — render `ManageTagsContent` through the shared
`ManageTagsCard` wrapper (`web/components/tags/manage-tags-card.tsx`), which owns the `Card`
shell and the `data-pw='manage-tags-active-heading'` heading. Never render `ManageTagsContent`
raw. The dialog fetches relations on open and only renders the full-page link when a route exists
for the current entity.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
