# Project Name Reference

[Back to Vitest Projects](reference-tests-vitest-projects.md#project-name-reference)

CI failure annotations start with the Vitest project in brackets. Translate that project directly
into the local command. For example:

```text
[backend-data-stores] backend/api/v1/memberships/refund.test.mts > suite > test
```

reproduces with:

```bash
pnpm exec vitest run --project backend-data-stores backend/api/v1/memberships/refund.test.mts
```

Aggregate scripts such as `test:backend`, `test:backend:default`, and `test:backend:core` select
additional projects and setup files. Use them for broader confidence only after running the exact
CI-named project; they are not substitutes for the isolation reproducer. For a one-off aggregate
selection, `pnpm run test:backend:default -- <file-a> <file-b> <file-c>` forwards all three filters
without passing the pnpm separator through to Vitest.

#### Large exact-file manifests

For a large one-off web selection, define the manifest once as a quoted shell array. Quoting
`"${files[@]}"` preserves each path as one argument, including spaces, parentheses, and bracketed
route segments. Do not replace the array with globs or command substitution, and do not insert a
literal `--` between Vitest's options and the paths. For syntax only, a path containing a space
would be written as `'web/path with spaces/example.test.tsx'`; put only existing test paths in the
runnable manifest.

Preflight the exact selection before running it. Pass `--project web` once, before the positional
path list, capture `vitest list --filesOnly` through `tee`, and abort unless its nonblank file count
matches the manifest count:

```bash
(
files=(
  'web/app/(fediverse)/fediverse/instances/page.mock.test.tsx'
  'web/app/(crawlers)/crawler/[id]/__tests__/layout.mock.test.tsx'
)

selected_file="$(mktemp "${TMPDIR:-/tmp}/voucha-vitest-selected.XXXXXX")" || exit 1
trap 'rm -f "$selected_file"' EXIT
set -o pipefail

if ! pnpm exec vitest list --project web --filesOnly "${files[@]}" | tee "$selected_file"; then
  printf 'Vitest preflight failed. Aborting.\n' >&2
  exit 1
fi

manifest_count=${#files[@]}
selected_count="$(awk 'NF { count++ } END { print count + 0 }' "$selected_file")"
if [ "$selected_count" -ne "$manifest_count" ]; then
  printf 'Vitest selected %s files; manifest contains %s. Aborting.\n' \
    "$selected_count" "$manifest_count" >&2
  exit 1
fi

pnpm exec vitest run --project web --bail=3 "${files[@]}"
)
```

For a manifest too large for one practical run, split it at coherent directory boundaries rather
than using an arbitrary fixed batch size. Preflight every batch independently and record both its
manifest and selected counts before running it.

A run is successful only when Vitest prints a passing summary **and the process exits with status
0**. If it prints a passing summary but remains alive, interrupt it, split or bisect the manifest,
preflight each smaller batch, and investigate the smallest reproducer with Vitest's
`--reporter=hanging-process` diagnostics.

The `include` and `exclude` arrays in [`vitest.config.mts`](../../vitest.config.mts) and
[`test-helpers/vitest-config/`](../../test-helpers/vitest-config/) are authoritative for which
project owns a file.
`backend-modules` does **not** use a DB `globalSetup`: a module that needs a database belongs in
`backend/data-stores/` or `backend/services/`, and its test uses the DB-backed project declared by
the current Vitest configuration. `backend-data-stores` is the usual owner; a test with an exact
global-aggregate contract may have a dedicated ordered project.
