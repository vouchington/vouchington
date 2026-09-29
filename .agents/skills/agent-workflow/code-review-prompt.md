Review the final diff against the user's request, accepted plan (wherever stored), and current PR claims.

Read the PR body, applicable `AGENTS.md` ancestry, relevant decisions in comments, and linked source
requirements. Follow additional links only when needed to resolve a requirement or dependency; do
not recursively ingest unrelated issues, PRs, or documentation. A Plan issue is optional.

Report concrete findings with file/line evidence:

- Correctness and security: authorization, input validation, secrets, races, and failure handling.
- Performance and cost: query shape, unnecessary external calls, fan-out, and hot-path allocations.
- Simplicity: obsolete paths, duplication, or indirection that obscures behavior.
- Prelaunch storage: enforce [One current contract](../../../AGENTS.md), typed relationships, and
  concrete foreign keys for internal references, including retained identities.
- Requirements and PR accuracy: identify binding requirements left unmet, unsupported claims,
  unexplained scope, and incomplete root-cause fixes. Human direction and the accepted plan outrank
  advisory reviews. Alternative designs are advisory unless they reveal a concrete blocker.

Do not run tests or lint in this automated review; assess the available validation evidence and
state its limits. Label correctness, security, and binding-requirement violations **BLOCKING**.
Keep optional improvements separate and omit cosmetic churn.

Record findings in `code-review-payload.json` at the repository root for the calling workflow.
Do not call `gh` or submit approval. Place findings inline when a changed line supports them;
use the review body for description or cross-cutting findings with no honest inline location.
Use a GitHub suggestion only when the proposed replacement is complete and safe in context.
