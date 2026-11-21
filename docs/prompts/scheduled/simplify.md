Review the codebase for DRY and simplification opportunities. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Load `typescript-authoring`.

- Look for duplicated utilities, repeated component patterns, unused indirection, flags whose callers all pass the same value (prefer a structural invariant that removes the unreachable branch), dead code, and code that belongs in an existing shared helper.
- Skip findings covered by open issues or PRs; record the queries and claim no coverage beyond them. If a finding is too large for one PR, keep looking for a bounded quick win; a tracking-issue recommendation never substitutes for a patch.
