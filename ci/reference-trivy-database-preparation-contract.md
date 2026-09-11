# Trivy database preparation contract

[Back to CI Tooling](README.md#trivy-database-preparation-contract)

`prepare-trivy-db.sh` wraps the published `vouchington prepare-trivy-db` helper, which downloads
the vulnerability database from the Google pull-through mirror without progress-bar noise. Each
registry attempt is bounded to 75 seconds (`TRIVY_DB_TIMEOUT`), so a stalled mirror cannot consume
the three-minute workflow step before the fallback runs. Any mirror failure triggers
one attempt against Trivy's official GHCR repository; if that also fails, the helper preserves the
official attempt's exit code. The web and backend image scans run only after this helper succeeds and
use `--skip-db-update`, so database transport failures are reported separately from vulnerability
findings. The fallback behavior is covered by
[`prepare-trivy-db.test.mts`](prepare-trivy-db.test.mts); the workflow contract is documented in
[the CI reference](../docs/development/ci.md#standalone-workflow-checks).

The pinned binary tools `ripgrep`, `shellcheck`, `selene`, `actionlint`, and `zizmor` are
installed via [`jdx/mise-action`](https://github.com/jdx/mise-action) from the
repo-root [`.mise.toml`](../.mise.toml) instead of per-tool install scripts. See
the [system dependency product contract](../docs/development/system-dependencies.md#product-contract).

When adding or extracting a workflow script, update the owning workflow path filters and keep
[`.github/workflows/AUTHORING.md`](../.github/workflows/AUTHORING.md#extracted-shell-scripts) in
sync with the expected `pnpm exec`, temporary-path, architecture, and fallback-error handling
rules.

Use `../dev/ci-local postgres-schema --dry-run` to print the PostgreSQL schema workflow commands
without starting a local database-backed run.
