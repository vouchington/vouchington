# Valkey Requests — memberships

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                                          | Client | Operation | Calls / job |
| --------------------------------------------------------------------------------------------------- | ------ | --------- | ----------- |
| `skuByStripePriceIdCache` / `activePlansCache` ValkeyCache reads (conditional on membership lookup) | cache  | get       | 0–2         |

**Total per job:** 0–2 (cache, conditional)

## Notes

- Most of the job processing is Stripe API calls and PSQL. ValkeyCache reads for SKU and active-plan lookups are conditional on whether the membership code path is invoked.
- All calls land on `cacheValkeyClient`.
- **Conditional:** Stripe identity-verification webhook events (checkout, session lifecycle) call `invalidate.users(userId)` = 1 `invokeScript` op (`cacheValkeyClient`) after updating user verification state. This is in addition to the SKU/plan cache reads and applies only to identity-type webhooks.
