Review supply-chain and CI/CD security. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Load `github-actions-rules` and `security-rules`.

- Harden a workflow: least-privilege `permissions`/`GITHUB_TOKEN`, a narrower `workflow_run` trigger and fork-PR checkout/secret exposure, or untrusted `${{ github.event.* }}` moved out of `run:` into env. Action SHA-pinning is already enforced by no-mistakes `github-actions-pinned-hash`; instead vet any newly added third-party action.
- Triage a dependency vulnerability from Dependabot or advisory alerts by severity and real exploitability. Dependabot is the sole npm vulnerability detector: do not run `pnpm audit` or an OSV scan. Unused-dependency hygiene is [dependencies.md](dependencies.md).
- Extend container, workflow-security, or dependency scan coverage where scanning already runs; a brand-new scanner is a separate one-time issue.
- A change that adds or widens a CI job names its runner label from the closed GitHub-hosted allowlist, keeps fan-out bounded, and uses the smallest runner that fits.
- Prefer adding a test or guard so the invariant is enforced, not fixed once.
- Cite the exact `main` HEAD SHA any pin, version, or permission claim in the PR body was verified against, after fetching and rebasing immediately before re-reading. After any rebase, rerun the test or coverage command so cited results match the cited SHA.
