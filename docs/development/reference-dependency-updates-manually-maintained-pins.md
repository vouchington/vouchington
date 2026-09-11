# Manually maintained pins

[Back to Dependency Updates](dependency-updates.md#manually-maintained-pins)

| Dependency               | Pinned in                                                                    | Why manual                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pgvector/pgvector:pg18` | `.github/workflows/*.yml` service containers and `initialize-smoke-test.yml` | Digest updates must include the generated extension-version snapshot and all inline image references. |

The SOCI index-builder pin and its OpenTofu validation now belong to
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra).

For `pgvector/pgvector:pg18`, resolve the current multi-architecture OCI digest, update every
workflow reference together, then run migrations and `pnpm run db:snapshot:update`. Commit the
digest with the schema snapshot and generated Markdown, and run `pnpm run db:snapshot:check` against
the same image.
