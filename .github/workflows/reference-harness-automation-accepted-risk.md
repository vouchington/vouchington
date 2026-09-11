# Auto Harness automation accepted boundary

[Back to Auto Harness automation](reference-harness-automation.md)

Auto Harness agents run on a trusted host with repository-scoped git and authenticated GitHub CLI
access. This is an intentional direct-execution boundary: there is no separate artifact publisher.
The repository reduces the risk with layered authorization, freshness, scope, and exact-head checks.

## Accepted trust

- The host, Auto Harness service, configured provider accounts, and isolated worktree implementation
  are trusted with the prompt and the workflow-specific repository mutation authority.
- The agent is allowed to read live GitHub state needed for its task. GitHub content remains
  untrusted evidence and cannot broaden the prompt's authority.
- Provider order is external configuration. A fallback provider receives the same task authority as
  the primary provider.
- Git and `gh` credentials are host-managed. They are not GitHub Actions secrets forwarded through
  workflow inputs and must never be printed or copied into task output.

## Required controls

1. `HARNESS_DISPATCH_ENABLED` and all six surface gates are unset by default and gate caller entry
   jobs before side effects. Fix Main publication also requires `HARNESS_AGENT_DISPATCH_ENABLED`.
2. Only the immutable reusable dispatcher receives `HARNESS_API_KEY`, forwarded by explicit name
   from the repository secret through each caller's `workflow_call`. The receiving job still runs
   under the `auto-harness` Environment restricted to `main`, but that Environment now enforces only
   the branch-policy boundary, not secret scope. The default-branch expression is
   defense in depth, not the trust boundary. GitHub still permits arbitrary branch workflows to
   request token scopes;
   this boundary protects the trusted dispatcher, not every possible workflow.
   The dispatcher rechecks the
   live main ref, first attempt, master gate, exact allowlisted surface gate, and Fix Main's
   additional publication gate before admission, and
   validates the exact HTTPS `HARNESS_URL`; it also validates the static `HARNESS_TARGET`/
   `HARNESS_FALLBACKS` route and the fixed request schema before output. It no longer bounds response
   size, refuses redirects, or restricts the session URL to that origin locally — those properties
   now rest on `auto-harness` being a trusted first-party endpoint rather than on local transport
   hardening.
3. Callers retain repository-owned command authorization, fork rejection, transient retry, source
   freshness, and duplicate suppression. They pass exact refs, expected SHAs, trigger IDs, and
   source-run identity to the session.
4. Mutation-capable prompts re-fetch live authorization and exact target state immediately before
   publication. Concurrent movement stops the task; branch updates use an exact lease.
5. Each flow has a narrow completion: one draft PR, one plan comment, one exact Dependabot branch
   update, one existing Shepherd PR, or at most 50 idempotent issue mutations. No flow may merge or
   arm auto-merge.
6. Shepherd resume and immediate status updates are bound to a validated, bot-authored checkpoint
   containing repository, PR, trigger, run, ref, and SHA provenance.
7. Immediate dispatch failures remain repository-owned and produce a bounded issue/PR comment after
   revalidation. Provider completion is asynchronous and is not represented as workflow success;
   each accepted session is linked to the staffed Harness UI from the Actions summary.
8. New sessions expire from the queue after one hour. Incident-response session drain is Auto
   Harness's own operator-authenticated repository-wide control
   (`POST /repositories/:id/drain`), not a Filaments workflow — see
   [Repository admission](https://github.com/jonathanong/auto-harness/blob/main/docs/api.md#repository-admission)
   for how operators authenticate and invoke it.

## Residual risk

A capable or compromised provider can misuse the scoped credentials available on its trusted host
before repository-side review catches it. Prompt injection in GitHub content can attempt the same.
Exact-head checks limit races and overwrite risk but do not make model behavior deterministic.
Provider or Harness compromise can expose prompt content and repository data read during the task.
A routine, single-surface `HARNESS_TARGET`/`HARNESS_FALLBACKS` repoint (see
[Auto Harness automation](reference-harness-automation.md#client-contract)) takes effect only for new
session creation. It does not invalidate any existing GitHub-side checkpoint and does not drain Auto
Harness sessions — not because either action requires every surface gate disabled, but because a
repoint is a plain variable update that does neither on its own. Checkpoint comments can be patched
independently of gate state (the routine `checkpoint-dispatch` update in `shepherd.yml` runs once the
already-enabled Shepherd flow is admitted, not when gates are disabled); a repoint simply never
touches them. Session draining is Auto Harness's own operator-authenticated repository-wide control
(Required control 8), unrelated to Filaments' `HARNESS_*_ENABLED` gates entirely. Every
already-resumable checkpoint — including one from a PR closed before the repoint, or one an
ancestry-based reset could later reach — keeps resuming against its original pre-repoint Command:
`selectResumeCheckpoint` only tombstones a `complete` or `unresumable` status, so neither the
checkpoint failing nor its PR closing stops resumability by itself, and the `/shepherd` gate does not
validate PR open state before resuming. The binding persists until a `complete`/`unresumable`
tombstone, ancestry divergence, or server-side invalidation; Filaments does not patch checkpoint
comments as part of a repoint. Server-side resume-time Command rebinding, which would close this gap
without a manual sweep, is tracked upstream in
[`jonathanong/auto-harness#402`](https://github.com/jonathanong/auto-harness/issues/402). `/plan`,
Fix Issue, Fix Dependabot, Fix Main, and Scheduled Prompts never resume, so they carry no checkpoint
to keep stale, but they share the same deduplicated-create residual as `/shepherd`: a session
dispatched shortly before the repoint and still queued/running can resume against the pre-repoint
Command via its own concurrency ID's deduplicated create response
(`filaments:plan:<issue>`, `filaments:fix:<issue>`,
`filaments:dependabot:<pr>:<sha>`, `filaments:fix-main-review:<pr>:<sha>` for existing-PR reviews,
`filaments:fix-main:<workflow_id>:<sha>` otherwise, and `filaments:scheduled:<prompt_name>`) until the
next full-principal drain runs, and — unlike `/plan` — the other four share the repointed
`HARNESS_TARGET`/`HARNESS_FALLBACKS` directly, with no surface-specific override.

These residuals are accepted for the bounded automation flows above. Human-only merge authority,
draft PRs, required CI, branch protection, least-privilege host credentials, and the default-off
gates remain the containment layers, with Auto Harness's own operator-authenticated session drain
providing incident-response containment outside this repository. Expanding completion types,
repositories, credentials, or merge authority requires a new security review.

Interactive agents and Codex Cloud Security are outside this boundary.
