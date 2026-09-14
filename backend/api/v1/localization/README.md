# Localization API

Public bounded localization batches from the immutable SQLite catalog.

## Endpoints

| Method | Route                  | Authentication | Description                                      |
| ------ | ---------------------- | -------------- | ------------------------------------------------ |
| GET    | `/api/v1/localization` | None           | Consumer/locale/selector batch with ETag and TTL |

## GET /api/v1/localization

Query parameters:

- `consumer` — public consumer only: `web`, `swift`, or `dotnet`. `email` is rejected.
- `locales` — ordered locale list (comma-separated or repeated). `en` aliases `en-US`.
- `selectors` — exact IDs or terminal prefixes (`nav.*`).

Returns contract `v1`, revision, `ttlSeconds`, and the selected messages. Unchanged revisions
return `304` when `If-None-Match` matches the ETag. Public bounds are the localization package
defaults: 8 locales, 32 selectors, 2,000 messages, and 512 KiB serialized. Web requests use the
generated exact chrome selector and exact current-route selector in one batch.

## Performance

| Endpoint                 | Round trips | Caching                          | Notes                                                                    |
| ------------------------ | ----------- | -------------------------------- | ------------------------------------------------------------------------ |
| GET /api/v1/localization | 0           | `ETag` + `Cache-Control: public` | Reads the local SQLite catalog. No PostgreSQL or Valkey. `email` is 400. |

## Related

- Service: [../../../services/localization/README.md](../../../services/localization/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
