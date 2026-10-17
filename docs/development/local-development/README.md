# Dev Environment Reference

Source entrypoint: [dev/README.md](../../../dev/README.md)

Local worktree tooling, services, and troubleshooting. See [AGENTS.md](../../../dev/AGENTS.md) for
agent-specific rules and the [local-site-testing skill](../../../.agents/skills/local-site-testing/SKILL.md)
for agent-run full-site startup and browser validation.

Always reach the site through the Cloudflare Worker over HTTPS: direct Next.js traffic bypasses
auth, CSP, caching, and `/api/*` routing, so it is never valid for browsing or browser QA.

## Development environment references

- <a id="initialization-modes"></a>[Initialization Modes](reference-initialization-modes.md)
- <a id="starting-services"></a>[Starting Services](reference-starting-services.md)
- <a id="agent-session-hooks"></a>[Agent Session Hooks](reference-agent-session-hooks.md)
- <a id="github-issue-tooling"></a>[GitHub Issue Tooling](agent-issue-labels/README.md)
- <a id="bedrock-embeddings-local"></a>[Bedrock Embeddings (local)](reference-bedrock-embeddings-local.md)
- <a id="miniflare-cache"></a>[Miniflare Cache](reference-miniflare-cache.md)
- <a id="cleanup"></a>[Cleanup](reference-cleanup.md)

## Reference index

- [Seed Data](../../../seed/README.md)
