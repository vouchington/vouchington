# Currency Catalog Service

Source entrypoint: [backend/services/currencies/README.md](../../../../../backend/services/currencies/README.md)

Reads the immutable supported-currency catalog used by
[`GET /api/v1/currencies`](../../../../requirements/api/v1/currencies/README.md). `listCurrencies()` returns lowercase
ISO 4217 codes and their minor-unit exponents through the canonical opaque cursor contract.

The schema and seed rows are owned by
[`0000-00-00-core-functions-sites.sql`](../../../../../backend/data-stores/psql/migrations/0000-00-00-core-functions-sites.sql).
