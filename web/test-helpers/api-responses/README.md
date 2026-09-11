# API Response Factories

Use these helpers for web tests that mock API response bodies. They keep response shapes tied to
`web/types/api-responses` and make serializer changes fail in one place instead of drifting across
inline literals. Defaults are backed by the committed shared corpus in `api-fixtures/v1`; run
`pnpm run api-fixtures:generate` after changing fixture cases and `pnpm run api-fixtures:check` to
verify snapshots are current.

Available factories:

| API area       | Factories                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Communities    | `makeCommunity`, `makeCommunityMetrics`, `makeCommunitiesSearchResponse`, `makeCommunityResponse`, `makeCommunityAiAgent`, `makeCommunityAiAgentResponse`                                                              |
| Referral links | `makeReferralLinkFeedUser`, `makeReferralLinkFeedItem`, `makeReferralLinkFeedResponse`, `makeUserReferralLink`, `makeUserReferralLinksResponse`, `makePrioritizedReferralLink`, `makePrioritizedReferralLinksResponse` |
| RSS feed items | `makeRssFeedItemTopic`, `makeRssFeed`, `makeRssFeedItemCategory`, `makeRssFeedItem`, `makeRssFeedItemsFeedResponse`                                                                                                    |
| Topics         | `makeTopic`, `makeTopicsSearchResponse`, `makeTopicMutationResponse`                                                                                                                                                   |

Import from `@/test-helpers/api-responses` for new tests. Existing module-specific imports remain
valid when a file already uses them.

## Shared Fixture Declarations

Every generated fixture consumed by `web` is declared once under `declarations/`. Each typed
declaration binds the manifest ID, imported response JSON, and the production API wrapper invocation
used to verify the request contract. Routes with both browser and server wrappers declare both
invocations, and each must independently match the manifest. `fixture-loader.ts` derives its ID and response maps from those
declarations, while `api-fixture-endpoint-coverage.mock.test.ts` injects the test-only client/server
wrapper context and compares the single captured request with `api-fixtures/v1/manifest.json`.

When adding or changing a web-consumed fixture:

- update its backend fixture case through the [shared fixture update flow](../../../backend/test-helpers/api-fixtures/README.md#update-flow), then regenerate the corpus;
- add or update the matching domain declaration with its exact response type, JSON body import, and
  every production wrapper invocation for that route;
- add new production wrapper namespaces only to the type-only endpoint context and test-only runtime
  adapter; declaration modules must not runtime-import API wrappers;
- run the loader, endpoint-coverage, and non-web manifest-coverage tests plus
  `pnpm run api-fixtures:check` and `pnpm --dir web typecheck`.

The generated manifest remains authoritative for web membership, method, path, query, and request
body. Duplicate declaration and endpoint-registry IDs throw instead of being overwritten.

## Semantics

- Entity factories accept partial overrides and fill every required serialized field.
- Factory defaults come from `api-fixtures/v1`, then apply overrides per call.
- Response factories derive sibling maps from supplied entities where possible.
- Defaults preserve explicit `null`: only `undefined` means "use the factory default".
- Use inline literals only for intentionally local shapes that are not API response fixtures.
- If an entity type is used in 3+ web test files, add or reuse a `make<Entity>(overrides?)`
  factory here instead of repeating the serialized shape inline.

## New Factory Checklist

- Add typed entity and response factories with defaults for all required fields.
- Cover override behavior, arrays/maps, sibling factory semantics, and explicit `null` preservation.
- Export the new family from this directory's `index.ts`.
- Extend the `web-no-inline-api-response-mock` ast-grep guard when inline response literals should be
  replaced by the new factory family.
