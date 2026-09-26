# Manually maintained pins

[Back to Dependency Updates](dependency-updates.md#manually-maintained-pins)

| Dependency               | Pinned in                                                                    | Why manual                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pgvector/pgvector:pg18` | `.github/workflows/*.yml` service containers and `initialize-smoke-test.yml` | Digest updates must include the generated extension-version snapshot and all inline image references. |

The SOCI index-builder pin and its OpenTofu validation now belong to
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra).

For `pgvector/pgvector:pg18`, resolve the current multi-architecture OCI digest, update every
workflow reference together, then push the PR and request `pnpm run db:snapshot:update`. The
workflow uses the candidate PR's image digest, runs migrations in a fresh database, and commits the
schema snapshot and generated Markdown to that PR. Fetch the commit before continuing; ordinary PR
CI checks it against the same image.
