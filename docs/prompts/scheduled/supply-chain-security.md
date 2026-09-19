Review supply-chain and CI/CD security. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Harden a GitHub Actions workflow: tighten a job's `permissions`/`GITHUB_TOKEN` toward least privilege, narrow a `pull_request_target` or `workflow_run` trigger and its fork-PR checkout/secret exposure, or move untrusted `${{ github.event.* }}` values out of `run:` steps into env vars. Action SHA-pinning is already enforced by no-mistakes `github-actions-pinned-hash` — do not re-propose it; instead vet any newly added third-party action.
- Triage a dependency vulnerability surfaced by GitHub Dependabot or advisory alerts, prioritizing by severity and real exploitability in our usage. Do not run `pnpm audit` or an independent OSV npm scan: Dependabot is the repository's sole npm vulnerability detector. This is distinct from `dependencies.md` (unused-dep hygiene) and from Dependabot version bumps.
- Extend container, workflow-security, or dependency scan coverage where such scanning already runs in CI. Introducing a brand-new scanner is tracked as a separate one-time issue, not this rotation.
- When a security improvement adds or widens a CI job, name which runner pool it draws from
  (`Tests`, `CPU`, `Playwright`, Ubicloud, CodeBuild, or `dependabot`) and prefer demand-neutral or
  demand-reducing changes to an already-busy pool.
- Least-privilege secret exposure for install/build steps is tracked in #7572's history; see
  [Secret and Permission Scoping](../../../.github/workflows/ACTIONS.md#secret-and-permission-scoping)
  for the mitigations that remain in place on ephemeral runners.
- Prefer changes that add or tighten a test or guard so the invariant is enforced rather than fixed once.
- Before writing any factual claim in the PR body about a pin, a version, or a permission value, fetch and rebase onto the current `main` HEAD immediately before re-reading the source, then cite the exact HEAD SHA the claim was verified against. Do not rely on an earlier read or an earlier fetch, either of which may already be stale if another PR landed on `main` first.
- A check conclusion or a coverage number cannot be made current by re-reading source after a rebase: the shared workflow's required validation (see [scheduled-prompt.md](../automation/scheduled-prompt.md)) already ran on the pre-rebase tree, so a rebase can silently attribute stale results to the newly cited SHA. After any rebase, regenerate that evidence by rerunning the test or coverage command, and cite the head SHA the fresh run executed against.
