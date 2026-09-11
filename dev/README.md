# Dev Environment Reference

Local worktree tooling, services, ports, and troubleshooting. See [CLAUDE.md](CLAUDE.md) for
agent-specific rules and the [local-site-testing skill](../.agents/skills/local-site-testing/SKILL.md)
for agent-run full-site startup and browser validation.

## Development environment references

- <a id="command-catalog"></a>[Command Catalog](reference-command-catalog.md)
- <a id="initialization-modes"></a>[Initialization Modes](reference-initialization-modes.md)
- <a id="resource-allocation-web-mode"></a>[Resource Allocation (backend/web modes)](reference-resource-allocation-web-mode.md)
- <a id="starting-services"></a>[Starting Services](reference-starting-services.md)
- <a id="agent-session-hooks"></a>[Agent Session Hooks](reference-agent-session-hooks.md)
- <a id="local-ci-parity"></a>[Local CI Parity](reference-local-ci-parity.md)
- <a id="pr-description-helper"></a>[PR Description Helper](reference-pr-description-helper.md)

`validate <pr>` additionally audits issue supersession (searches open issues for vocabulary derived from the PR's diff deletions, including `package.json` scripts removed via pre/post-image key diffing) and milestone completion (enumerates a nearly-finished milestone's remaining open siblings, audited in the repo each closed issue actually lives in); every hit needs a `Closes #N`/`owner/repo#N` or an `issue-audit: keep-open` marker — see the audit bullet in [git-and-prs.md](../.agents/skills/agent-workflow/git-and-prs.md). `gh` call budget: zero extra calls for a PR with no deletions, no changed `package.json`, and no milestone-carrying closes; otherwise up to 12 sequential `gh issue list --search` calls (one per removed-surface term, capped); one lazy, memoized `gh api compare` call to resolve the merge base plus two content fetches per changed `package.json` (base + head); and one `gh issue list --milestone` call per distinct `(repo, milestone)` pair touched, not per milestone title alone, so a foreign closing reference costs one extra call rather than being silently skipped. `create`/`update` run only the supersession search, and only as a non-blocking advisory hint.

## Operational tooling references

- <a id="plan-issue-helper"></a>[Plan Issue Helper](reference-plan-issue-helper.md)
- <a id="github-issue-tooling"></a>[GitHub Issue Tooling](agent-issue-labels/README.md)
- <a id="rename-audit"></a>[Rename Audit](reference-rename-audit.md)
- <a id="traffic-routing"></a>[Traffic Routing](reference-traffic-routing.md)
- <a id="individual-services"></a>[Individual Services](reference-individual-services.md)
- <a id="worker-process-defaults"></a>[Worker Process Defaults](reference-worker-process-defaults.md)
- <a id="logs-and-debugging"></a>[Logs and Debugging](reference-logs-and-debugging.md)
- <a id="required-tools"></a>[Required Tools](reference-required-tools.md)
- <a id="shared-secrets"></a>[Shared Secrets](reference-shared-secrets.md)
- <a id="bedrock-embeddings-local"></a>[Bedrock Embeddings (local)](reference-bedrock-embeddings-local.md)
- <a id="playwright-tests"></a>[Playwright Tests](reference-playwright-tests.md)
- <a id="miniflare-cache"></a>[Miniflare Cache](reference-miniflare-cache.md)
- <a id="git-config"></a>[Git Config](reference-git-config.md)
- <a id="cleanup"></a>[Cleanup](reference-cleanup.md)
- <a id="related"></a>[Related](reference-related.md)
