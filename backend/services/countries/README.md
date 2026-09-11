# Countries Service

Reference data accessor for the global `countries` table. Backs the public `/api/v1/countries`
endpoint. Other services (e.g. `@services/topics/retailers`) read the `countries` table directly
via SQL joins rather than going through this service.

## API

- `getCountries()` — return all countries ordered by name. Each row has `id`, `code`, and `name`.

The list is small and stable, so no caching layer is wired up here; consumers cache at the HTTP
edge instead (see the route README).

## Schema

`countries` is seeded from migration data and is not user-editable. Schema is defined in
[../../data-stores/psql/migrations/](../../data-stores/psql/migrations/).

## Related

- Route: [../../api/v1/countries/README.md](../../api/v1/countries/README.md)
- Backend services: [../CLAUDE.md](../CLAUDE.md)
