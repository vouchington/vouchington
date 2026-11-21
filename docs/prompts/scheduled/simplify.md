Simplify production code. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Unit: one folder under `backend/services`, `web/components`, or `web/app`.

Load the `simplify` skill and `typescript-authoring`. Repo-specific targets: duplicated utilities and component patterns, flags whose callers all pass the same value (prefer a structural invariant that removes the unreachable branch), and code that belongs in an existing shared helper. Test cleanup belongs to [test-pruning.md](test-pruning.md); documentation cleanup to [docs.md](docs.md).
