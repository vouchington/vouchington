# Impact and test discovery

Run discovery before finalizing the Plan so affected files and tests come from repository evidence, not guesses.

## Batch compatible inputs

Batch every relevant file accepted by the same config, framework, and environment into one
whole-repository analysis session; do not split batches by workspace. For TypeScript and JavaScript
planning, `pnpm exec no-mistakes planning-impact` writes dependency, dependent, symbol, and
Vitest-plan artifacts through the package-owned private artifact workflow, so they share one
discovery session, sources, facts, and graph work. A docs-only manifest requests only the Vitest
plan and emits compatible empty structural artifacts.
Separate sessions only when the config, framework, environment, or intended relationship scope differs.

## Private result artifacts

Potentially verbose machine-readable results stay outside the main agent context:

1. Set `umask 077`, record `${TMPDIR:-/tmp}` as `impact_parent`, create one session directory under
   it with `mktemp -d`, and enforce `chmod 700 "$impact_dir"` before writing evidence. Fail
   immediately if creation or permission enforcement fails. Keep the changed-files manifest and
   `plan.json` in the same private directory.
2. Write one repository-relative changed path per line to `$impact_dir/changed-files.txt`, then run
   the aggregate impact driver once. Do not put additional `no-mistakes` calls in `Promise.all`,
   background jobs, or another parallel fan-out. Under Grok/Codex/Cursor `workspace-write`, also run
   `pnpm exec` serially (pnpm 11's store SQLite). Parallel non-no-mistakes tools go through
   `node_modules/.bin/<tool>`.
3. The driver preserves separate `<name>.json`, `<name>.stderr`, and `<name>.status` files for each
   report even though all four reports come from one analysis session. On aggregate failure it
   removes stale JSON and records the same bounded diagnostic and nonzero status for every report.
4. A nonzero status, missing output, or invalid JSON is a failed discovery step. Surface the status
   and at most the first 10 diagnostic or warning lines, then fix or journal the failure; never infer
   success from an empty orchestration result.
5. After validating the artifact, report only its status, result counts, direct file or symbol
   names, selected test commands, and diagnostics or warnings. Each per-command summary is capped at
   4 KiB total. List at most 20 entries per field, truncate every entry to 200 characters, and
   report the total and omitted entry counts. Apply the same 200-character cap to at most the first
   10 diagnostic or warning lines. Never paste a complete JSON artifact into the main agent context.

Use descriptive artifact names such as `dependencies.json`, `dependents.json`, `symbols.json`, and
`plan.json`, with matching `.stderr` and `.status` files. If full transitive traversal is justified
after the direct pass, save it under a distinct name in the same directory and apply the same
validation and bounded-summary rules.

| Invocation                 | JSON artifact            | Stderr artifact            | Status artifact            | Bounded main-context summary                         |
| -------------------------- | ------------------------ | -------------------------- | -------------------------- | ---------------------------------------------------- |
| Dependencies, depth 1      | `dependencies.json`      | `dependencies.stderr`      | `dependencies.status`      | Direct file count and paths; first 10 diagnostics    |
| Dependents, depth 1        | `dependents.json`        | `dependents.stderr`        | `dependents.status`        | Direct file count and paths; first 10 diagnostics    |
| Symbols                    | `symbols.json`           | `symbols.stderr`           | `symbols.status`           | Import/export counts and names; first 10 diagnostics |
| Vitest test plan           | `plan.json`              | `plan.stderr`              | `plan.status`              | Selected test commands; first 10 warnings            |
| Vitest test explanation    | `why.json`               | `why.stderr`               | `why.status`               | Focused reason fields and names; first 10 warnings   |
| Optional full dependencies | `dependencies-full.json` | `dependencies-full.stderr` | `dependencies-full.status` | Total count and reason the deeper pass was needed    |
| Optional full dependents   | `dependents-full.json`   | `dependents-full.stderr`   | `dependents-full.status`   | Total count and reason the deeper pass was needed    |

Use this portable aggregate-analysis shape:

```bash
umask 077
impact_parent=${TMPDIR:-/tmp}
if ! impact_dir="$(mktemp -d "$impact_parent/no-mistakes-impact.XXXXXX")"; then
  echo 'Private impact directory setup failed' >&2
  exit 1
fi
if ! chmod 700 "$impact_dir"; then
  echo 'Private impact directory permission setup failed' >&2
  exit 1
fi
printf '%s\n' <source-file-a> <source-file-b> >"$impact_dir/changed-files.txt"
pnpm exec no-mistakes planning-impact \
  --changed-files "$impact_dir/changed-files.txt" \
  --output-dir "$impact_dir"
```

Create the directory once per discovery session; do not recreate it for each report. The command
requires the manifest to be inside that mode-0700 directory, emits valid JSON only on success, and
caps failure diagnostics at 4 KiB.

## Structural TypeScript and JavaScript impact

- Dependencies: depth one, `import` and `workspace` relationships
- Dependents: depth one, `import` and `workspace` relationships
- Symbols: imports and exports for every changed source
- Vitest plan: `prePush` selection for the same changed-file manifest

Run these reports together through the private-artifact contract above. The default relationship
scope avoids constructing unrelated Markdown, CI, route, queue, and native edges for structural
TS/JS planning. Pass `--broad` only when the Plan needs those domain relationships explicitly; name
the reason in the journal before running it. If a result is empty, cross-check with `rg` and inspect
the matching stderr artifact; do not drop the repository tsconfig as a workaround.

## Test planning

The aggregate driver produces `plan.json` from the same manifest and prepared analysis as the
structural reports. Summarize selected test commands and warnings rather than ingesting the complete
plan. Use single-file analysis only after the initial aggregate batch has completed, and pass
`--plan "$impact_dir/plan.json"` to the explanation command through the same artifact boundary:

```bash
if pnpm exec no-mistakes tests why <test-file> --plan "$impact_dir/plan.json" --format json \
  >"$impact_dir/why.json" 2>"$impact_dir/why.stderr"; then
  why_status=0
else
  why_status=$?
fi
if [ "$why_status" -eq 0 ] && ! node -e '
const source = require("node:fs").readFileSync(process.argv[1], "utf8")
if (!source.trim()) throw new Error("why.json is empty")
JSON.parse(source)
' "$impact_dir/why.json" 2>>"$impact_dir/why.stderr"; then
  why_status=1
fi
printf '%s\n' "$why_status" >"$impact_dir/why.status"
```

The inline validator rejects empty or malformed `why.json` and appends its diagnostic to
`why.stderr`. Apply the same per-field, per-entry, and total summary caps.

## Cleanup

After the Plan and journal or retrospective have consumed the evidence, remove the exact private
session directory. Fail closed if the path does not match the directory pattern created above:

```bash
case "$impact_dir" in
  "$impact_parent"/no-mistakes-impact.[[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]])
    rm -rf -- "$impact_dir"
    ;;
  *)
    echo 'Refusing to remove unexpected impact directory' >&2
    exit 1
    ;;
esac
unset impact_dir impact_parent
```

## Specialized recipes and fallback

Use the shared [Endpoint Migration](../../agent-workflow/impact-recipes.md#endpoint-migration)
recipe for endpoint migrations. Use the broader
[impact recipes](../../agent-workflow/impact-recipes.md) for
native API parity, proposed imports and package legality, and queue/worker dispatch. For test
deletion, React props, selectors, exports, and other generic workflows, use the [archived
no-mistakes impact recipes](https://github.com/jonathanong/filaments/blob/9c16169c0ef234bccd79aea5a50216505f0c8b7c/.agents/skills/no-mistakes/references/impact-recipes.md).

Use the aggregate driver for generic TS/JS planning; unscoped traversals in specialized recipes are
reserved for their domain-specific questions.

Use `rg` for unsupported file types and as an unexpected-zero cross-check, not as a silent replacement for supported `no-mistakes` analysis. Journal failed invocations, warnings, false or surprising results, and unexpected zero results for the retrospective.
