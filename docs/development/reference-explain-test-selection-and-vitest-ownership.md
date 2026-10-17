# Explain Test Selection and Vitest Ownership

[Back to Vitest Projects](reference-tests-vitest-projects.md#explain-test-selection-and-vitest-ownership)

Use the `no-mistakes tests` planner (`plan vitest`, `why`, `targets`) before choosing tests by filename or directory. Batch all changed sources for the same framework across the whole repository in one `plan` call, save the JSON, and use `why` and `targets` for single-file diagnostics.

The planner is a local diagnostic: CI never selects individual test files and runs the full suite of each touched area ([area test suites](ci.md#area-test-suites)).

<a id="traceable-vitest-setup-files"></a>The planner traces Vitest `setupFiles` and `globalSetup` entries only when each entry is a plain literal relative path, or an identifier bound to one. A call expression such as `resolve(process.cwd(), ...)` sets `fallback_triggered` for every project sharing that config and lists all their tests under a `Vitest setup fallback` reason, which makes the plan useless for impact discovery. no-mistakes resolves a literal relative to the repository root while Vitest resolves it relative to the project's own `root:`; `web-storybook-browser` overrides `root: 'web'`, so its literals resolve through one-line redirect shims.

Reading a plan:

- `groups[].type: "direct"` holds test files that were themselves changed. A source-only plan does not include its colocated test; append directly modified tests as in the [before-push commands](../../.agents/skills/agent-workflow/before-pushing.md).
- A two-node reason whose `via` is `["test"]` is the paired source-to-test relationship. Longer reasons with `dependency` steps are broader graph dependents; inspect them with `tests why` before treating a distant test as the source's primary contract.
- "Same-package contract" is a Vouchington review heuristic, not a planner group: prefer returned tests under the changed source's nearest `package.json`, but keep cross-package results whose dependency path describes a real public contract.

For cross-language parity, package-legality, and queue-impact fallbacks, follow the local [impact-map recipes](../../.agents/skills/agent-workflow/impact-recipes.md).
