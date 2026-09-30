# Request Validation

[Back to My API](README.md#request-validation)

Protected `/api/v1/my/**` routes that declare a path, header, or JSON body carrier validate it
against the generated `@voucha/api-fixtures/v1/request-contracts.json` schema through
`validateRequestContract`. See
[`@services/runtime-request-validation`](../../../../overview/architecture/services/runtime-request-validation/README.md#security-boundary)
for the general ordering rule and
[`docs/requirements/api/README.md`](../../README.md#route-helpers) for the adapter's call pattern.
A malformed body, an unrecognized top-level field, or a wrong-typed field returns `422` with a
redacted diagnostic. The schema is generated from the DTO type each handler casts
`ctx.request.json(...)` to, so the type and the runtime check cannot drift. After changing one, run
`pnpm run openapi:generate` and `pnpm run api-fixtures:generate`.

API keys and the assistant chat routes are validated with their own slice and are not described
here. `oauth-apps` and `oauth-grants` were already validated before this page existed.

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

## Query carriers the schema does not validate

Paginated `GET` routes build their query with `createPaginationParser`, which clamps an
out-of-range `limit` and answers a malformed cursor with `400`. The generated query contract types
`limit` as an integer, but `ctx.query` always carries raw strings and the shared validator does no
coercion, so running it would turn today's clamping into a `422`. These routes therefore validate no
query carrier; each has an inline comment at its `apiQuery(...)` call, and each family below lists
its own.

## Routes with no request contract

Some `/my` operations have no entry in the generated request-contract bundle, so there is no schema
to validate against and they are unchanged. They are mostly `GET` list and read routes that declare
no carrier (for example `GET /my/profile`, `GET /my/cards`, `GET /my/messages`,
`GET /my/notifications`, `GET /my/bans`, and the two `/my/export/*` routes), plus
`POST /my/notifications/read-all` and `POST /my/identity-verification/checkout-sessions`, which take
no input. A few of them read query parameters by hand, such as `limit` and `after` on
`GET /my/bans`, `include_platform` on `GET /my/removed-posts`, `action` on
`GET /my/contribution-status`, and the export flags. Declaring and validating those query carriers
is a follow-up.

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
  `verified_badge_visible`.

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

Query carriers not validated: `GET /my/email-addresses`.

## Cards, rewards programs, and spending

Covers `POST`/`PATCH`/`DELETE` on `/my/cards`, `/my/rewards-program-point-valuations`,
`/my/rewards-program-statuses`, and `/my/spending-categories`.

`Money` and `ScaledMoney` fields (`credit_limit`, `amount`, `value_per_point`) are validated by the
generated schema: a strict object with an integer minor-unit amount, a known currency, and, for
`ScaledMoney`, `scale: 6`. It replaces the per-field `isMoney`/`isScaledMoney` asserts, which
answered `422` for the same inputs. Spending-category `spending_frequency` is an enum of `monthly`
and `annually`, and `spending_category_id` and `household_id` are UUIDs.

Status changes from `400` to `422`:

- A missing required field (`card_id`, `rewards_program_id`, `value_per_point`,
  `rewards_program_status_id`, `spending_category_id`, `amount`) or a non-object body.

Other behavior changes:

- Unrecognized fields used to be ignored and are now `422`.

Money, frequency, date-string, and note type errors that these handlers already answered with `422`
keep that status; only the source of the diagnostic moved to the shared validator.

Query carriers not validated: `GET /my/rewards-program-point-valuations`,
`GET /my/rewards-program-statuses`, and `GET /my/spending-categories`. `GET /my/cards` paginates
through `createPaginationParser` but declares no `apiQuery` contract, so it has no query schema.

## Cross-client verification

Every web caller that builds a body for these routes was read against the generated schemas. None
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
