# Request Validation

[Back to My API](README.md#request-validation)

Protected `/api/v1/my/**` routes that declare a path, header, query, or JSON body carrier validate it
against the checked-in `@voucha/api-fixtures/v1/request-contracts.json` schema through
`validateRequestContract`. See
[`@services/runtime-request-validation`](../../../../overview/architecture/services/runtime-request-validation/README.md#security-boundary)
for the general ordering rule and
[`docs/requirements/api/README.md`](../../README.md#route-helpers) for the adapter's call pattern.
A malformed body, an unrecognized top-level field, or a wrong-typed field returns `422` with a
redacted diagnostic. The checked-in schema is maintained alongside each handler DTO and its
consumers. Update the explicit contract data and fixture cases together, following the
[fixture update flow](../../../../development/testing/backend/api-fixtures.md#update-flow);
compiler discovery and request-schema generation are removed.

API keys and the assistant chat routes are validated with their own slice and are not described
here, except for their list reads: the paginated `GET /my/api-keys`, `/my/oauth-apps`, and
`/my/oauth-grants` validate their query like every other `/my` list, under
[Query carriers](#query-carriers). `oauth-apps` and `oauth-grants` bodies were already validated
before this page existed.

## Ordering

1. `requireAuth` returns a bare `401` for an unauthenticated caller whatever the request looks like.
   The schema is never checked before authentication, so an anonymous malformed call gets no
   diagnostic.
2. `assertNotSuspended` (`403`) where the route has it, then the route's own ownership, membership,
   or role check (`403`/`404`).
3. `validateRequestContract` (`422`).
4. Semantic checks the schema cannot express (id existence, URL scheme, key length) keep their own
   statuses, then the service call.

Path ids keep the handler's `isUUID` check. The generated path schema is a plain string that the
router already satisfies, so a path-only call cannot reject anything by itself. A route that only
declares a path carrier is covered by its existing `401`/`403`/`404`/`2xx` tests, not by a `422`
test.

## Query carriers

Every `/my` route that reads a query declares it with `apiQuery(...)` and validates it with
`validateRequestContract`, after identity and any ownership or role check and before the service
read. `ctx.query` carries raw strings and the shared validator does no coercion. The two export
routes hand it `ctx.query` as the client sent it (see below); every other handler parses first and
validates the values it settled on:

1. The pagination parser (or the handler's own lenient read) clamps `limit`, decodes the cursor, and
   keeps its status: `400` for a `limit` that is not a positive integer, an empty or repeated
   `after`, or a cursor it cannot decode.
2. `prepareQueryForValidation(ctx.query, contract)` converts the well-formed wire values and drops
   any key the contract does not declare.
3. The parsed `limit` overwrites the prepared one, so a `limit` the parser clamps (`limit=500`
   becomes `100`) is validated as `100` and never becomes a `422`.
4. `validateRequestContract` runs.

Unknown query parameters are ignored, as on every other validated query carrier: the generated
query schemas never set `additionalProperties: false`, and step 2 drops undeclared keys. After the
parser accepts a request the schema cannot fail, so it is a drift guard between the source and the
published contract, and the parser or handler status stays the contract. Only the two export routes
can fail their schema, because they validate the value the client actually sent instead of a rebuilt
literal (plan #298, no exception list). `format`, `preflight` and `download` no longer fall back to
a default when the value is invalid: each answers `422` before the export limit is read or anything
streams. A `feed_type` outside the feed types used to fail the database enum cast with a `500` and
is also a `422`. An empty `feed_type` is dropped before validation because it has always meant no
filter.

The paginated reads below run the parser first, so their `400` and their clamped `limit` are
unchanged. On the thread routes under `/my/messages/:conversationId/**`, conversation membership
(`403`) is checked first, so a stranger or an unknown conversation gets `403` for a malformed query
and never a schema diagnostic.

| Route                                                                                                                  | Query                                                     | Status on failure                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /my/email-addresses`                                                                                              | `after`, `limit`                                          | `400` from the parser                                                                                                                                                                                                                                                                      |
| `GET /my/rewards-program-point-valuations`, `/rewards-program-statuses`, `/spending-categories`                        | `after`, `limit`                                          | `400` from the parser, or from the cursor decoder for a malformed cursor                                                                                                                                                                                                                   |
| `GET /my/notifications/push-subscriptions`, `/communities`, `/friend-recommendations`, `/warnings`, `/referral-clicks` | `after`, `limit`                                          | `400` from the parser                                                                                                                                                                                                                                                                      |
| `GET /my/cards`, `GET /my/notifications`, `GET /my/api-keys`, `GET /my/oauth-apps`, `GET /my/oauth-grants`             | `after`, `limit`                                          | `400` from the parser, or from the cursor decoder for a malformed cursor                                                                                                                                                                                                                   |
| `GET /my/messages`, `GET /my/messages/:conversationId/messages`, `GET /my/messages/:conversationId/participants`       | `after`, `limit`                                          | `400` from the parser or the cursor decoder. The two thread reads answer `403` to a non-member before the query is read.                                                                                                                                                                   |
| `GET /my/bans`, `GET /my/removed-posts`                                                                                | `after`, `limit`, and `include_platform` on removed posts | None from the schema. A `limit` that is not a positive integer uses `25`, a larger one is clamped to `100`, a repeated or empty `after` is ignored, and only `include_platform=true` includes platform removals. A malformed cursor is still `400`.                                        |
| `GET /my/contribution-status`                                                                                          | `action`                                                  | `400` for an unknown or repeated `action`, checked before the plan lookup                                                                                                                                                                                                                  |
| `GET /my/export/rss-feeds`                                                                                             | `feed_type`, `format`, `preflight`                        | `422` before the export runs for a `feed_type` outside of `article`, `podcast`, `video`, `mixed` (case-sensitive), a `format` outside `json`, `csv`, `opml`, a `preflight` other than `1`, or a repeated key. An empty `feed_type` is no filter, and an omitted `format` exports OPML XML. |
| `GET /my/export/topics`                                                                                                | `download`, `preflight`                                   | `422` for a `download` or `preflight` other than `1`, or a repeated key. Omitted means the normal response.                                                                                                                                                                                |

## Routes with no request contract

Some `/my` operations have no entry in the generated request-contract bundle, so there is no schema
to validate against and they are unchanged. They are mostly `GET` list and read routes that declare
no carrier (for example `GET /my/profile`), plus `POST /my/notifications/read-all` and
`POST /my/identity-verification/checkout-sessions`, which take no input. `GET /my/topic-claims`
reads no query. The two `GET /my/conversations` reads still parse their query with
`createPaginationParser` and declare no `apiQuery` contract; declaring them is a follow-up.

## Account, profile, and preferences

Covers `PATCH /my/identity`; the email-address routes; `PATCH /my/email-preferences`;
`PATCH /my/profile` and the profile-link routes; `PUT /my/financial-profile`;
`PATCH /my/identity-verification/display-preferences`; `POST`/`DELETE /my/consents`; and
`POST`/`DELETE /my/aside-preferences`.

These bodies used to be read as `Record<string, unknown>` and checked field by field. Each handler
now casts to a concrete request type, so the schema is strict: an unrecognized field, a wrong type,
or a non-object body (`null`, an array, a scalar) is `422`.

Status changes from `400` to `422`:

- A missing, wrong-typed, or non-object body on the routes above that used to answer `400`.
- `POST /my/consents` with an unknown `consent_type`.
- `POST`/`PATCH /my/profile/links` with an unknown `link_type` or a non-UUID `image_id`, and
  `PUT /my/profile/links/order` with an empty or non-UUID `ids` list.
- `PATCH /my/identity` with a non-UUID `profile_image_id`.
- `PATCH /my/identity-verification/display-preferences` with a wrong-typed
  `is_verified_badge_visible`.

Checks the schema does not replace keep their own status:

- A blank (whitespace-only) `aside_key` or `version` is still `400`, and one longer than 100 or 50
  characters is still `422`, after trimming.
- An unknown consent type on `DELETE /my/consents/:type` and a blank key on
  `DELETE /my/aside-preferences/:asideKey` are still `400`, because the path schema is a plain
  string.

Other behavior changes:

- `PUT /my/profile/links/order` now rejects a list with duplicate ids (`422`). It used to accept one.
- `PATCH /my/identity` validates the whole body before its first write, so a rejected request
  changes nothing.
- On the display-preferences route the schema check runs before the "identity verified" eligibility
  check. Both answer `422`.

## Cards, rewards programs, and spending

Covers `POST`/`PATCH`/`DELETE` on `/my/cards`, `/my/rewards-program-point-valuations`,
`/my/rewards-program-statuses`, and `/my/spending-categories`.

`Money` and `ScaledMoney` fields (`credit_limit`, `amount`, `value_per_point`) are validated by the
declared schema: a strict object with an integer minor-unit amount, a known currency, and, for
`ScaledMoney`, `scale: 6`. It replaces the per-field `isMoney`/`isScaledMoney` asserts, which
answered `422` for the same inputs. Spending-category `spending_frequency` is an enum of `monthly`
and `annually`, and `spending_category_id` and `household_id` are UUIDs.

Status changes from `400` to `422`:

- A missing required field (`card_topic_id`, `rewards_program_id`, `value_per_point`,
  `rewards_program_status_id`, `spending_category_id`, `amount`) or a non-object body.

Other behavior changes:

- Unrecognized fields used to be ignored and are now `422`.

Money, frequency, date-string, and note type errors that these handlers already answered with `422`
keep that status; only the source of the diagnostic moved to the shared validator.

`GET /my/cards` declares and validates its `after` and `limit` query under
[Query carriers](#query-carriers).

## Messaging, imports, notifications, and landing pages

Covers the direct-message routes under `/my/messages`, the assistant conversation routes under
`/my/conversations`, `POST /my/import/topics`, `POST /my/import/rss-feeds` and
`GET /my/import/rss-feeds/:importId`, the landing-page routes, the web-push subscription routes,
`GET /my/communities`, and `GET /my/friend-recommendations`.

Status changes from `400` to `422`:

- `POST /my/messages` with a non-object body, neither `user_id` nor `user_ids`, or `user_ids` empty,
  longer than 25, or holding a non-string.
- `POST /my/messages/:conversationId/messages` with a non-object body or a non-string `text`.
- `POST /my/messages/:conversationId/participants` and `PATCH /my/messages/:conversationId` with a
  non-object body. A missing or invalid `user_id` and an unknown `participant_add_policy` were
  already `422`.
- `PATCH /my/conversations/:conversationId` with a missing or non-string `title`.
- `POST /my/import/topics` with a non-object body, `names` missing, empty, not an array, or longer
  than 500, and an `Idempotency-Key` that is not a UUID.
- `POST /my/import/rss-feeds` with a non-object body, no source key or more than one, a non-string
  `opml`, `csv`, or `urls`, or a non-boolean `follow`.
- `POST`/`PATCH /my/landing-pages` with a missing or `null` `title` or `slug`, or a wrong-typed
  `subtitle`.
- `PUT /my/landing-pages/:pageId/items` with `items` that is not an array, an unknown item `type`, a
  non-UUID reference id, or a non-string link `label` or `url`.
- `POST /my/notifications/push-subscriptions` with a non-object body, or a missing or non-string
  `endpoint`, `p256dh`, or `auth`.

Other behavior changes:

- `POST /my/messages` with both `user_id` and `user_ids` used to take `user_id` and ignore the
  list. It is now `422`.
- A non-string entry in `names` (`POST /my/import/topics`) or in `urls`
  (`POST /my/import/rss-feeds`) used to be dropped silently. It is now `422`.
- A numeric `title` or `slug` on a landing page used to be coerced to a string. It is now `422`.

Checks the schema does not replace keep their own status:

- `POST /my/messages/:conversationId/messages` still answers `400` for blank `text`.
- `POST /my/notifications/push-subscriptions` still answers `400` for an unparseable or non-HTTPS
  `endpoint` and for a short or long `p256dh` or `auth`. A negative or fractional
  `expiration_time_ms` is `422`.
- `POST /my/import/topics` still answers `400` when every name is blank, and
  `POST /my/import/rss-feeds` still answers `400` when a list has no URL column, no non-empty URL,
  or more than 500 URLs.

Ordering notes:

- Membership on the thread routes under `/my/messages/:conversationId/**` and ownership on
  `/my/conversations/:conversationId/**` are checked before the schema, so a stranger sees `403`
  and an unknown id `404` even for a malformed body.
- `POST /my/messages/:conversationId/participants` and `PATCH /my/messages/:conversationId` check
  the conversation role in the handler (`currentUserCanManageParticipants`,
  `currentUserCanChangeParticipantPolicy`) before the schema, so a member or outsider without the
  role gets `403` for a malformed body. `PATCH /my/landing-pages/:pageId` and
  `PUT /my/landing-pages/:pageId/items` call `getLandingPageRowForUser` first, so a page the caller
  does not own is `404`. The services still repeat these checks. Before this change a caller with
  no access saw a validation status for a malformed body on these routes.
- `GET /my/messages/:conversationId`, `GET /my/import/rss-feeds/:importId`, and
  `GET`/`DELETE /my/landing-pages/:pageId` validate only their path carrier, ahead of the service's
  ownership lookup. The path schema is a plain string that cannot fail, so the order does not change
  what a caller sees.

## Cross-client verification

Every web caller that builds a body for these routes was read against the checked-in schemas. None
sends an unknown field, a wrong-typed value, or `null` where the schema does not allow it, and the
web client shows the same generic copy for `400` and `422` on these endpoints, so the status change
does not alter what a user sees. No checkout of the native clients
(`vouchington/vouchington-clients`) exists locally, so they were not verified directly; check them
against the field lists in `request-contracts.json`.

- Account, profile, and preferences: the web callers for profile, profile links, identity, email
  preferences, financial profile, identity-verification display preferences, and email addresses
  conform. The web client has no caller for `/my/consents` or `/my/aside-preferences`, so neither
  was checked against a client here.
- Cards, rewards programs, and spending: the web callers for cards, spending categories, rewards
  program statuses, and point valuations conform, including their `Money` and `ScaledMoney` values.
- Messaging, imports, notifications, and landing pages: the web callers for messages,
  participants, the add policy, topic and RSS imports, landing pages, and push subscriptions
  conform. A push subscription with no expiration sends `expiration_time_ms: null`, which the
  schema allows. The web client has no caller for `/my/conversations/*`.
- RSS export `feed_type`: the web callers of `GET /my/export/rss-feeds` send `article`, `podcast`,
  or `video` from the source-type dropdown, or omit `feed_type` for "all". None sends `mixed`, a
  repeated key, an empty value, or a value outside the enum, so the `500` to `422` change is not
  reachable from the web client. The native clients were not checked (see above).
- Export `format`, `preflight` and `download`: the web callers send only `format=csv` (or omit it),
  `preflight=1` and `download=1`, so the strict `422` is not reachable from the web client.
