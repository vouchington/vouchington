# @services/localization

Reads the immutable SQLite catalog compiled into the API and worker images. Public consumers
(`web`, `swift`, `dotnet`) are served through `GET /api/v1/localization`. Email copy stays
internal and is resolved from the same local file, never over HTTP. Production web SSR and
locale switches fetch chrome + the current route from that API; tests may read catalog JSON or
SQLite directly.

## Key exports

- `localizationGetResult(query, ifNoneMatch)` — public GET payload, ETag, `304`, and TTL
- `resolveEmailLocalizationBatch(locales, selectors)` — local email-only resolution
- `getLocalizationDatabase()` — opens `LOCALIZATION_SQLITE_PATH` (default `/app/localization/catalog.sqlite`)

Catalog JSON in `localization/catalog/` is the committed source: row-based `copies.json`,
`aliases.json`, per-locale `translations/*.json`, and generated `routes.json`. Image builds
compile it with `backend/services/localization/compile-cli.mts`. Playwright CI compiles a temp sqlite file
on `/dev/shm` when present so unbatched inserts do not fsync on a contended runner disk,
then sets `LOCALIZATION_SQLITE_PATH`; `serve.mts` compiles on `PLAYWRIGHT_TEST` if that
file is missing. Web-integration calls `compileCatalogForProcess()`.
Agents change rows only through `pnpm run localization:catalog --` and resolve merge conflicts
through its `conflict-resolve` command; see the
[catalog authoring guide](../../../docs/requirements/users/LOCALIZATION.md#catalog-authoring-and-conflicts).

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- API: [../../api/v1/localization/README.md](../../api/v1/localization/README.md)
- Runtime: [`@vouchington/localization`](https://www.npmjs.com/package/@vouchington/localization)
- Compiler: [`@vouchington/localization-compiler`](https://www.npmjs.com/package/@vouchington/localization-compiler)
