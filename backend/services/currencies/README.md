# Currency Catalog Service

Reads the immutable supported-currency catalog used by
[`GET /api/v1/currencies`](../../api/v1/currencies/README.md). `listCurrencies()` returns lowercase
ISO 4217 codes and their minor-unit exponents through the canonical opaque cursor contract.

The schema and seed rows are owned by
[`0000-00-00-core-functions-sites.sql`](../../data-stores/psql/migrations/0000-00-00-core-functions-sites.sql).
